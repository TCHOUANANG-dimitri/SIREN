import { AppState } from 'react-native';
import { env, featureFlags } from '@/config/env';
import { useAuthStore } from '@/stores/authStore';
import { refreshSession } from '../http/client';
import type { RealtimeChannel } from './types';
import { createWsChannel } from './wsChannel';

export type { ConnectionStatus, RealtimeChannel, RealtimeEvent } from './types';

function createNoopChannel(): RealtimeChannel {
  return {
    watch() {},
    subscribe: () => () => {},
    // Temps réel désactivé : rien n'est « manqué », les données viennent du polling REST.
    getStatus: () => 'connected',
    getLastMessageAt: () => null,
    stop() {},
  };
}

function createChannel(): RealtimeChannel {
  if (env.apiMode === 'mock') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../mock/entry').createMockChannel();
  }
  if (!featureFlags.websocket) return createNoopChannel();

  const channel = createWsChannel({
    url: env.wsUrl,
    getToken: () => useAuthStore.getState().accessToken,
    refreshToken: refreshSession,
  });
  // En arrière-plan, le push prend le relais : on ferme les sockets pour
  // préserver la batterie et on les rouvre au retour au premier plan.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') channel.resume();
    else if (state === 'background') channel.pause();
  });
  return channel;
}

let instance: RealtimeChannel | null = null;

/** Canal temps réel unique de l'application (créé à la première demande). */
export function getRealtimeChannel(): RealtimeChannel {
  if (!instance) instance = createChannel();
  return instance;
}
