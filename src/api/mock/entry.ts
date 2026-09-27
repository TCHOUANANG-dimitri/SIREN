/**
 * Seul point d'entrée du backend simulé pour le reste de l'application.
 * En build live, Metro remplace ce module par `entry.live-stub.ts` (voir
 * metro.config.js) : ni la base de démo ni les données fictives ne sont
 * embarquées dans l'APK de production.
 */
import { mockEventBus } from './mockEventBus';

export { mockApi } from './index';
export { initMockBackend, resetMockBackend } from './bootstrap';
export { createMockChannel } from './realtime';

export function simulateMockDisconnect(totalMs = 8000) {
  mockEventBus.simulateDisconnect(totalMs);
}
