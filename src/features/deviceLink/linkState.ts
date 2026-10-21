/**
 * Machine d'états du lien local téléphone ↔ dispositif (transport agnostique).
 *
 * Le protocole de référence (docs/transition-données-serveur.pdf) ne définit
 * AUCUN lien direct téléphone ↔ traceur (le traceur ne parle qu'au broker MQTT) :
 * le transport réel (BLE, etc.) est BLOQUÉ en attente de spécification — voir
 * docs/TACHES_DIFFEREES.md (T-BLE-01). Cette machine et le `SimulatedTransport`
 * permettent de tester toute la logique sans matériel.
 *
 *   idle ──start──▶ searching ──found──▶ connecting ──connected──▶ connected
 *     ▲                │ timeout             │ failed                  │ lost
 *     └──stop──────────┴──────▶ backoff ◀────┴─────────────────────────┘
 *                                 │ retry
 *                                 └──────▶ searching
 */
export type LinkState =
  | { name: 'idle' }
  | { name: 'searching'; attempt: number }
  | { name: 'connecting'; attempt: number; deviceId: string }
  | { name: 'connected'; deviceId: string; since: number }
  | { name: 'backoff'; attempt: number; retryAt: number; reason: LinkFailure };

export type LinkFailure = 'timeout' | 'connect_failed' | 'link_lost' | 'unauthorized_device';

export type LinkEvent =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'found'; deviceId: string }
  | { type: 'connected'; at: number }
  | { type: 'timeout'; at: number }
  | { type: 'failed'; at: number; reason?: LinkFailure }
  | { type: 'lost'; at: number }
  | { type: 'retry' };

export const LINK_BACKOFF = { baseMs: 2_000, maxMs: 5 * 60_000 };

export function linkBackoffMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(LINK_BACKOFF.maxMs, LINK_BACKOFF.baseMs * 2 ** Math.max(0, attempt - 1));
  // Gigue « pleine » : évite que tous les téléphones réessaient au même instant.
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}

/**
 * Transition pure. Un événement non prévu dans l'état courant est ignoré (l'état
 * est renvoyé tel quel) : jamais d'état incohérent.
 * `expectedDeviceId` : seul le dispositif associé à l'enfant est accepté.
 */
export function linkReducer(state: LinkState, event: LinkEvent, expectedDeviceId: string, random?: () => number): LinkState {
  if (event.type === 'stop') return { name: 'idle' };
  switch (state.name) {
    case 'idle':
      return event.type === 'start' ? { name: 'searching', attempt: 1 } : state;
    case 'searching':
      if (event.type === 'found') {
        // Un autre boîtier à portée n'est jamais utilisé (pas de relais d'un dispositif non associé).
        if (event.deviceId !== expectedDeviceId) return state;
        return { name: 'connecting', attempt: state.attempt, deviceId: event.deviceId };
      }
      if (event.type === 'timeout') return backoff(state.attempt, event.at, 'timeout', random);
      return state;
    case 'connecting':
      if (event.type === 'connected') return { name: 'connected', deviceId: state.deviceId, since: event.at };
      if (event.type === 'failed') return backoff(state.attempt, event.at, event.reason ?? 'connect_failed', random);
      if (event.type === 'timeout') return backoff(state.attempt, event.at, 'timeout', random);
      return state;
    case 'connected':
      if (event.type === 'lost' || event.type === 'failed') return backoff(1, event.at, 'link_lost', random);
      return state;
    case 'backoff':
      return event.type === 'retry' ? { name: 'searching', attempt: state.attempt + 1 } : state;
  }
}

function backoff(attempt: number, at: number, reason: LinkFailure, random?: () => number): LinkState {
  return { name: 'backoff', attempt, retryAt: at + linkBackoffMs(attempt, random), reason };
}
