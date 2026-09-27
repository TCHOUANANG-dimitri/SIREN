import { z } from 'zod';
import { logger } from '@/utils/logger';
import { alertSchema, positionSchema, stateForScore } from '../contracts';
import type { ConnectionStatus, RealtimeChannel, RealtimeEvent, RealtimeHandler } from './types';

/**
 * Canal temps réel sur le WebSocket serveur v1 :
 *   WSS {wsUrl}?token=<accessToken>&childId=<id>  → { event, data }
 * Une socket par enfant suivi (le serveur diffuse par enfant).
 *
 * Reconnexion avec backoff exponentiel + gigue, battement de cœur, arrêt de
 * la reconnexion sur refus d'authentification (4001) jusqu'au prochain jeton,
 * déduplication des messages rejoués.
 */

export interface WsChannelOptions {
  url: string;
  getToken: () => string | null;
  /** Tente d'obtenir un nouveau jeton après un refus 4001. */
  refreshToken?: () => Promise<string | null>;
  createSocket?: (url: string) => WebSocket;
  heartbeatMs?: number;
  maxBackoffMs?: number;
  now?: () => number;
}

const AUTH_REJECTED = 4001;
const DEDUPE_WINDOW = 64;

const envelopeSchema = z.object({ event: z.string(), data: z.record(z.string(), z.unknown()).default({}) });

/** Convertit un message serveur en événement normalisé ; null si inconnu ou invalide. */
export function parseServerMessage(childId: string, raw: string): RealtimeEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) return null;
  const { event, data } = envelope.data;

  switch (event) {
    case 'position_update': {
      // Le serveur v1 ne diffuse qu'un sous-ensemble (lat, lon, speedKmh, ts) :
      // on ne fabrique pas précision ni qualité, on se contente d'invalider.
      const full = positionSchema.safeParse(data);
      const complete = full.success && data.accuracyM !== undefined && data.fixQuality !== undefined;
      return { type: 'position_update', childId, position: complete ? full.data : null };
    }
    case 'risk_update': {
      const score = typeof data.score === 'number' ? Math.max(0, Math.min(100, Math.round(data.score))) : null;
      if (score === null) return null;
      const state =
        data.state === 'veille' || data.state === 'prealerte' || data.state === 'urgence' || data.state === 'disparition'
          ? data.state
          : stateForScore(score);
      const reasons = Array.isArray(data.reasons) ? data.reasons.filter((r): r is string => typeof r === 'string') : [];
      return { type: 'risk_update', childId, score, state, reasons, risk: null };
    }
    case 'alert':
    case 'alert_update': {
      const alert = alertSchema.safeParse(data);
      return { type: 'alert', childId, alert: alert.success ? alert.data : null };
    }
    default:
      return null;
  }
}

interface Connection {
  childId: string;
  socket: WebSocket | null;
  attempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  authRejected: boolean;
  closedByUs: boolean;
}

export function createWsChannel(options: WsChannelOptions): RealtimeChannel & {
  pause(): void;
  resume(): void;
} {
  const handlers = new Set<RealtimeHandler>();
  const connections = new Map<string, Connection>();
  const recent: string[] = [];
  const heartbeatMs = options.heartbeatMs ?? 25_000;
  const maxBackoffMs = options.maxBackoffMs ?? 30_000;
  const now = options.now ?? Date.now;
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));
  let status: ConnectionStatus = 'disconnected';
  let lastMessageAt: string | null = null;
  let paused = false;

  function emit(event: RealtimeEvent) {
    handlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        logger.error(error, { stage: 'realtime-handler' });
      }
    });
  }

  function refreshStatus() {
    const all = [...connections.values()];
    const next: ConnectionStatus = paused
      ? 'disconnected'
      : all.length === 0
        ? 'connected'
        : all.every((c) => c.socket?.readyState === 1)
          ? 'connected'
          : all.some((c) => c.retryTimer !== null || c.socket?.readyState === 0)
            ? 'reconnecting'
            : 'disconnected';
    if (next !== status) {
      status = next;
      emit({ type: 'connection', status });
    }
  }

  function isDuplicate(key: string): boolean {
    if (recent.includes(key)) return true;
    recent.push(key);
    if (recent.length > DEDUPE_WINDOW) recent.shift();
    return false;
  }

  function clearTimers(conn: Connection) {
    if (conn.retryTimer) clearTimeout(conn.retryTimer);
    if (conn.heartbeat) clearInterval(conn.heartbeat);
    conn.retryTimer = null;
    conn.heartbeat = null;
  }

  function scheduleReconnect(conn: Connection) {
    if (paused || conn.closedByUs || conn.authRejected) return;
    const base = Math.min(maxBackoffMs, 1000 * 2 ** conn.attempt);
    const delay = base / 2 + Math.random() * (base / 2);
    conn.attempt += 1;
    conn.retryTimer = setTimeout(() => {
      conn.retryTimer = null;
      open(conn);
    }, delay);
    refreshStatus();
  }

  function open(conn: Connection) {
    const token = options.getToken();
    if (!token || paused) {
      refreshStatus();
      return;
    }
    const url = `${options.url}${options.url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}&childId=${encodeURIComponent(conn.childId)}`;
    let socket: WebSocket;
    try {
      socket = createSocket(url);
    } catch (error) {
      logger.warn('Ouverture WebSocket impossible', { error: String(error) });
      scheduleReconnect(conn);
      return;
    }
    conn.socket = socket;
    conn.closedByUs = false;

    socket.onopen = () => {
      conn.attempt = 0;
      conn.authRejected = false;
      conn.heartbeat = setInterval(() => {
        try {
          if (socket.readyState === 1) socket.send('ping');
        } catch {
          // la fermeture déclenchera la reconnexion
        }
      }, heartbeatMs);
      refreshStatus();
    };

    socket.onmessage = (message: WebSocketMessageEvent) => {
      const raw = typeof message.data === 'string' ? message.data : '';
      if (!raw || raw === 'pong') return;
      if (isDuplicate(`${conn.childId}|${raw}`)) return;
      lastMessageAt = new Date(now()).toISOString();
      const event = parseServerMessage(conn.childId, raw);
      if (event) emit(event);
    };

    socket.onerror = () => {
      // Aucune info exploitable côté RN : la fermeture qui suit gère la reprise.
    };

    socket.onclose = (event: WebSocketCloseEvent) => {
      clearTimers(conn);
      conn.socket = null;
      if (conn.closedByUs) {
        refreshStatus();
        return;
      }
      if (event.code === AUTH_REJECTED) {
        conn.authRejected = true;
        refreshStatus();
        void options.refreshToken?.().then((fresh) => {
          if (fresh && connections.get(conn.childId) === conn) {
            conn.authRejected = false;
            open(conn);
          }
        });
        return;
      }
      scheduleReconnect(conn);
    };
    refreshStatus();
  }

  function close(conn: Connection) {
    conn.closedByUs = true;
    clearTimers(conn);
    try {
      conn.socket?.close(1000);
    } catch {
      // déjà fermée
    }
    conn.socket = null;
  }

  return {
    watch(childIds) {
      const wanted = new Set(childIds);
      for (const [id, conn] of connections) {
        if (!wanted.has(id)) {
          close(conn);
          connections.delete(id);
        }
      }
      for (const id of wanted) {
        if (connections.has(id)) continue;
        const conn: Connection = {
          childId: id,
          socket: null,
          attempt: 0,
          retryTimer: null,
          heartbeat: null,
          authRejected: false,
          closedByUs: false,
        };
        connections.set(id, conn);
        open(conn);
      }
      refreshStatus();
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    getStatus: () => status,
    getLastMessageAt: () => lastMessageAt,
    pause() {
      paused = true;
      connections.forEach(close);
      refreshStatus();
    },
    resume() {
      if (!paused) return;
      paused = false;
      connections.forEach((conn) => {
        conn.attempt = 0;
        conn.authRejected = false;
        open(conn);
      });
      refreshStatus();
    },
    stop() {
      connections.forEach(close);
      connections.clear();
      refreshStatus();
    },
  };
}
