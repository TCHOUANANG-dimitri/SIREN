import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig, type Method } from 'axios';
import { API_VERSION, env } from '@/config/env';
import { logger } from '@/utils/logger';
import { ApiError, codeFromStatus, userMessageFor, type ErrorCode } from '../errors';

/**
 * Client HTTP unique de l'application (mode live).
 *
 * Responsabilités : URL de base versionnée, jeton d'accès, rafraîchissement
 * unique et partagé sur 401, délai maximal, nouvelles tentatives uniquement
 * pour les requêtes sûres, clé d'idempotence pour les écritures, conversion
 * des erreurs en `ApiError` présentables. Aucun composant UI ne l'appelle
 * directement : seuls les dépôts de `src/api/live` l'utilisent.
 */

export interface SessionBridge {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokensRefreshed: (tokens: { accessToken: string; refreshToken?: string }) => Promise<void> | void;
  onSessionExpired: () => Promise<void> | void;
}

export interface RequestOptions {
  /** Pas d'en-tête Authorization ni de rafraîchissement (routes /auth/*). */
  skipAuth?: boolean;
  /** Messages spécifiques à la route, par code d'erreur. */
  messages?: Partial<Record<ErrorCode, string>>;
  /** Clé d'idempotence fournie par l'appelant (sinon générée pour POST/PATCH/PUT/DELETE). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RETRY_DELAYS_MS = [500, 1500];

let bridge: SessionBridge | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function configureSession(next: SessionBridge) {
  bridge = next;
}

function newIdempotencyKey(): string {
  const rnd = () => Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${rnd()}-${rnd()}`;
}

export function createHttpInstance(baseURL = `${env.apiBaseUrl}/api/${API_VERSION}`): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });
}

let instance: AxiosInstance = createHttpInstance();

/** Tests uniquement : remplace l'instance (adaptateur simulé). */
export function setHttpInstance(next: AxiosInstance) {
  instance = next;
  refreshInFlight = null;
}

function toApiError(error: unknown, messages?: RequestOptions['messages']): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError(userMessageFor('unknown'), 0, 'unknown', error);
  if (error instanceof AxiosError) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ApiError(messages?.timeout ?? userMessageFor('timeout'), 408, 'timeout', error);
    }
    if (!error.response) {
      return new ApiError(messages?.network ?? userMessageFor('network'), 0, 'network', error);
    }
    const status = error.response.status;
    const code = codeFromStatus(status);
    return new ApiError(messages?.[code] ?? userMessageFor(code), status, code, {
      status,
      url: error.config?.url,
      method: error.config?.method,
      // Le détail serveur est conservé pour le diagnostic, jamais affiché tel quel.
      detail: (error.response.data as { detail?: unknown } | undefined)?.detail,
    });
  }
  return new ApiError(userMessageFor('unknown'), 0, 'unknown', error);
}

async function refreshAccessToken(): Promise<string | null> {
  if (!bridge) return null;
  if (!refreshInFlight) {
    const current = bridge;
    refreshInFlight = (async () => {
      const refreshToken = current.getRefreshToken();
      if (!refreshToken) return null;
      try {
        const res = await instance.post<{ accessToken?: string; refreshToken?: string }>('/auth/refresh', { refreshToken });
        const accessToken = res.data?.accessToken;
        if (!accessToken) return null;
        await current.onTokensRefreshed({ accessToken, refreshToken: res.data.refreshToken });
        return accessToken;
      } catch (error) {
        logger.warn('Échec du rafraîchissement de session', { status: (error as AxiosError)?.response?.status });
        return null;
      }
    })().finally(() => {
      // Libère le verrou au tour suivant : les appels concurrents ont déjà récupéré la promesse.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    });
  }
  return refreshInFlight;
}

/** Rafraîchit la session hors requête HTTP (ex. WebSocket refusé en 4001). */
export function refreshSession(): Promise<string | null> {
  return refreshAccessToken();
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function request<T = unknown>(
  method: Method,
  url: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const upper = method.toUpperCase();
  const isSafe = SAFE_METHODS.has(upper);
  const headers: Record<string, string> = {};
  if (!isSafe) headers['Idempotency-Key'] = options.idempotencyKey ?? newIdempotencyKey();

  const buildConfig = (token: string | null): AxiosRequestConfig => ({
    method,
    url,
    data: body,
    signal: options.signal,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
  });

  let token = options.skipAuth ? null : bridge?.getAccessToken() ?? null;
  let refreshed = false;
  let attempt = 0;

  for (;;) {
    try {
      const response = await instance.request<T>(buildConfig(token));
      return response.data;
    } catch (raw) {
      const status = raw instanceof AxiosError ? raw.response?.status : undefined;

      if (status === 401 && !options.skipAuth && !refreshed) {
        refreshed = true;
        const next = await refreshAccessToken();
        if (next) {
          token = next;
          continue;
        }
        await bridge?.onSessionExpired();
        throw new ApiError(userMessageFor('session_expired'), 401, 'session_expired', raw);
      }

      const error = toApiError(raw, options.messages);
      // Seules les lectures sont rejouées automatiquement ; une écriture peut avoir
      // été appliquée côté serveur avant la coupure (paiement, acquittement…).
      if (isSafe && error.isRetryable && attempt < RETRY_DELAYS_MS.length && !options.signal?.aborted) {
        await wait(RETRY_DELAYS_MS[attempt]);
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
}

export const http = {
  get: <T = unknown>(url: string, options?: RequestOptions) => request<T>('GET', url, undefined, options),
  post: <T = unknown>(url: string, body?: unknown, options?: RequestOptions) => request<T>('POST', url, body ?? {}, options),
  patch: <T = unknown>(url: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', url, body ?? {}, options),
  delete: <T = unknown>(url: string, options?: RequestOptions) => request<T>('DELETE', url, undefined, options),
};

/** Encode un segment de chemin fourni par l'utilisateur ou le serveur. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}
