import { linkReducer, type LinkEvent, type LinkState } from './linkState';
import type { Outbox, RelaySender } from './outbox';
import type { FrameTransport } from './transport';

/**
 * Session de relais pour UN dispositif (celui associé à l'enfant) :
 * transport → machine d'états → file locale → serveur (POST /device/v1/relay).
 *
 * - une trame dont l'identifiant (1er champ) n'est pas le dispositif attendu est
 *   ignorée : le téléphone ne relaie jamais les données d'un autre boîtier ;
 * - la trame est relayée telle quelle (ni lue au-delà de cet identifiant, ni modifiée) ;
 * - le serveur ne l'accepte que d'un compte autorisé sur l'enfant, puis la livre
 *   uniquement aux comptes autorisés (canaux temps réel existants).
 */
export class DeviceLinkSession {
  state: LinkState = { name: 'idle' };
  private listeners = new Set<(state: LinkState) => void>();

  constructor(
    private readonly deviceId: string,
    private readonly transport: FrameTransport,
    private readonly outbox: Outbox,
    private readonly send: RelaySender,
    private readonly now: () => number = Date.now
  ) {}

  subscribe(listener: (state: LinkState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.dispatch({ type: 'start' });
    this.transport.start(this.deviceId, {
      onFound: (id) => this.dispatch({ type: 'found', deviceId: id }),
      onConnected: () => this.dispatch({ type: 'connected', at: this.now() }),
      onFrame: (frame) => void this.receive(frame),
      onLost: () => this.dispatch({ type: 'lost', at: this.now() }),
      onFailed: () => this.dispatch({ type: 'failed', at: this.now() }),
    });
  }

  stop(): void {
    this.transport.stop();
    this.dispatch({ type: 'stop' });
  }

  /** À appeler quand l'attente de `backoff` est écoulée. */
  retry(): void {
    if (this.state.name === 'backoff' && this.state.retryAt <= this.now()) this.dispatch({ type: 'retry' });
  }

  timeout(): void {
    this.dispatch({ type: 'timeout', at: this.now() });
  }

  /** Relaie la file vers le serveur (à appeler au retour du réseau, ou périodiquement). */
  flush() {
    return this.outbox.flush(this.send);
  }

  async receive(frame: string): Promise<boolean> {
    if (this.state.name !== 'connected') return false;
    if (frame.split(';', 1)[0]?.trim() !== this.deviceId) return false;
    return this.outbox.enqueue(frame);
  }

  private dispatch(event: LinkEvent) {
    const next = linkReducer(this.state, event, this.deviceId);
    if (next !== this.state) {
      this.state = next;
      for (const listener of this.listeners) listener(next);
    }
  }
}
