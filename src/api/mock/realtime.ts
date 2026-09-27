import type { RealtimeChannel, RealtimeEvent, RealtimeHandler } from '../realtime/types';
import { mockEventBus, type BusEvent } from './mockEventBus';

/** Adapte le bus d'événements simulé au contrat `RealtimeChannel`. */
function toRealtimeEvent(event: BusEvent): RealtimeEvent | null {
  switch (event.type) {
    case 'position_update':
      return { type: 'position_update', childId: event.childId, position: event.position };
    case 'risk_update':
      return {
        type: 'risk_update',
        childId: event.childId,
        score: event.risk.score,
        state: event.risk.state,
        reasons: event.risk.reasons,
        risk: event.risk,
      };
    case 'alert':
      return { type: 'alert', childId: event.alert.childId, alert: event.alert };
    case 'place_learned':
      return { type: 'place_learned', childId: event.childId };
    case 'connection':
      return { type: 'connection', status: event.status };
    default:
      return null;
  }
}

export function createMockChannel(): RealtimeChannel {
  let lastMessageAt: string | null = null;
  return {
    watch() {
      // Le bus simulé diffuse pour tous les enfants ; le filtrage se fait à la réception.
    },
    subscribe(handler: RealtimeHandler) {
      return mockEventBus.subscribe((event) => {
        const mapped = toRealtimeEvent(event);
        if (!mapped) return;
        if (mapped.type !== 'connection') lastMessageAt = new Date().toISOString();
        handler(mapped);
      });
    },
    getStatus: () => mockEventBus.getConnectionStatus(),
    getLastMessageAt: () => lastMessageAt,
    stop() {},
  };
}
