import type { Alert, Position, RiskScore, RiskState } from '@/models/entities';

/**
 * Simule le canal temps réel WS /ws du CDC §6 (taxonomie CDC2 §4.6 :
 * position_update, risk_update, alert, state_change) avec un pub/sub en mémoire.
 * Aucune vraie socket : compatible Expo Go à 100%.
 */
export type BusEvent =
  | { type: 'position_update'; childId: string; position: Position }
  | { type: 'risk_update'; childId: string; risk: RiskScore }
  | { type: 'alert'; alert: Alert }
  | { type: 'state_change'; childId: string; from: RiskState; to: RiskState }
  | { type: 'place_learned'; childId: string; placeId: string }
  | { type: 'connection'; status: 'connected' | 'disconnected' | 'reconnecting' };

type Handler = (event: BusEvent) => void;

class MockEventBus {
  private handlers = new Set<Handler>();
  private connectionStatus: 'connected' | 'disconnected' | 'reconnecting' = 'connected';

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: BusEvent) {
    if (event.type === 'connection') this.connectionStatus = event.status;
    this.handlers.forEach((handler) => handler(event));
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  /** Simule une coupure réseau puis une reconnexion avec backoff exponentiel — exerce le §12 CDC1. */
  simulateDisconnect(totalMs = 8000) {
    this.emit({ type: 'connection', status: 'disconnected' });
    let waited = 0;
    let backoff = 1000;
    const attempt = () => {
      this.emit({ type: 'connection', status: 'reconnecting' });
      setTimeout(() => {
        waited += backoff;
        if (waited >= totalMs) {
          this.emit({ type: 'connection', status: 'connected' });
        } else {
          backoff = Math.min(backoff * 2, 4000);
          attempt();
        }
      }, backoff);
    };
    attempt();
  }
}

export const mockEventBus = new MockEventBus();
