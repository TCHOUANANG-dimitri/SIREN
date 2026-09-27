import type { Alert, Position, RiskScore, RiskState } from '@/models/entities';

/**
 * Événements temps réel normalisés, indépendants du transport (bus mock ou
 * WebSocket serveur). Taxonomie serveur v1 : position_update, risk_update,
 * alert. `place_learned` n'existe qu'en mock à ce jour.
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export type RealtimeEvent =
  /** `position` complète si la source la fournit, sinon seulement l'invalidation. */
  | { type: 'position_update'; childId: string; position: Position | null }
  | {
      type: 'risk_update';
      childId: string;
      score: number;
      state: RiskState;
      reasons: string[];
      /** Score complet si la source le fournit. */
      risk: RiskScore | null;
    }
  | { type: 'alert'; childId: string; alert: Alert | null }
  | { type: 'place_learned'; childId: string }
  | { type: 'connection'; status: ConnectionStatus };

export type RealtimeHandler = (event: RealtimeEvent) => void;

export interface RealtimeChannel {
  /** Déclare les enfants suivis ; ouvre / ferme les abonnements nécessaires. */
  watch(childIds: string[]): void;
  subscribe(handler: RealtimeHandler): () => void;
  getStatus(): ConnectionStatus;
  /** Horodatage ISO du dernier message reçu (bandeau « mise à jour à HH:MM »). */
  getLastMessageAt(): string | null;
  stop(): void;
}
