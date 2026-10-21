/**
 * File locale persistante des trames reçues du dispositif (store-and-forward).
 *
 * Garanties :
 * - persistance (survit à un redémarrage) via un `OutboxStore` injecté ;
 * - idempotence locale : une même trame (même texte) n'est mise en file qu'une fois ;
 *   le serveur dédoublonne aussi (empreinte SHA-256 + fenêtre ± 2 s) ;
 * - TTL : une trame trop ancienne n'est plus relayée (elle ne décrit plus la situation) ;
 * - taille bornée : au-delà de MAX_ITEMS, les plus anciennes sont écartées
 *   (le dispositif garde lui-même 2000 positions, protocole §5) ;
 * - réessais avec attente exponentielle + gigue ; les refus définitifs du serveur
 *   (trame invalide, compte non autorisé) sortent de la file sans réessai.
 *
 * Le téléphone ne lit ni ne modifie la trame : il la relaie telle quelle.
 * Limite connue : la trame n'est ni signée ni chiffrée par le protocole ; elle est
 * stockée en clair dans le stockage de l'app (bac à sable), effacée à la
 * déconnexion — voir docs/DECISIONS_TECHNIQUES.md (D-08).
 */
import { linkBackoffMs } from './linkState';

export interface OutboxItem {
  key: string;
  frame: string;
  /** ms epoch de réception par le téléphone. */
  receivedAt: number;
  attempts: number;
  nextAttemptAt: number;
}

export interface OutboxStore {
  load(): Promise<OutboxItem[] | null>;
  save(items: OutboxItem[]): Promise<void>;
}

export type RelayStatus = 'accepted' | 'duplicate' | 'rejected' | 'forbidden';
export type RelaySender = (frames: string[]) => Promise<{ status: RelayStatus; reason?: string }[]>;

export const OUTBOX_LIMITS = {
  ttlMs: 72 * 3600_000,
  maxItems: 2000,
  /** Taille maximale d'un lot accepté par POST /device/v1/relay. */
  batchSize: 100,
  maxFrameLength: 512,
};

export interface FlushReport {
  sent: number;
  duplicates: number;
  dropped: { key: string; status: RelayStatus; reason?: string }[];
  expired: number;
  retryLater: number;
}

/** Empreinte locale non cryptographique (FNV-1a 32 bits) — clé de dédoublonnage seulement. */
export function frameKey(frame: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < frame.length; i += 1) {
    hash ^= frame.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, '0')}:${frame.length}`;
}

export class Outbox {
  private items: OutboxItem[] = [];
  private loaded = false;
  private flushing: Promise<FlushReport> | null = null;

  constructor(
    private readonly store: OutboxStore,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    this.items = (await this.store.load()) ?? [];
    this.loaded = true;
    this.prune();
  }

  get size(): number {
    return this.items.length;
  }

  snapshot(): readonly OutboxItem[] {
    return this.items;
  }

  /** Ajoute une trame reçue ; renvoie false si elle est ignorée (doublon, vide, trop longue). */
  async enqueue(frame: string): Promise<boolean> {
    await this.load();
    const value = frame.trim();
    if (!value || value.length > OUTBOX_LIMITS.maxFrameLength) return false;
    const key = frameKey(value);
    if (this.items.some((item) => item.key === key && item.frame === value)) return false;
    const at = this.now();
    this.items.push({ key, frame: value, receivedAt: at, attempts: 0, nextAttemptAt: at });
    this.prune();
    await this.store.save(this.items);
    return true;
  }

  /** Relaie les trames dues, par lots ; un seul envoi à la fois (pas de double envoi concurrent). */
  flush(send: RelaySender): Promise<FlushReport> {
    if (!this.flushing) {
      this.flushing = this.doFlush(send).finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  async clear(): Promise<void> {
    this.items = [];
    this.loaded = true;
    await this.store.save([]);
  }

  private prune(): number {
    const cutoff = this.now() - OUTBOX_LIMITS.ttlMs;
    const before = this.items.length;
    this.items = this.items.filter((item) => item.receivedAt >= cutoff);
    const expired = before - this.items.length;
    if (this.items.length > OUTBOX_LIMITS.maxItems) this.items = this.items.slice(this.items.length - OUTBOX_LIMITS.maxItems);
    return expired;
  }

  private async doFlush(send: RelaySender): Promise<FlushReport> {
    await this.load();
    const report: FlushReport = { sent: 0, duplicates: 0, dropped: [], expired: this.prune(), retryLater: 0 };
    const due = this.items.filter((item) => item.nextAttemptAt <= this.now());
    for (let start = 0; start < due.length; start += OUTBOX_LIMITS.batchSize) {
      const batch = due.slice(start, start + OUTBOX_LIMITS.batchSize);
      let results: { status: RelayStatus; reason?: string }[];
      try {
        results = await send(batch.map((item) => item.frame));
        if (results.length !== batch.length) throw new Error('relay_result_mismatch');
      } catch {
        // Réseau ou serveur indisponible : tout le lot (et la suite) est reporté.
        for (const item of due.slice(start)) this.reschedule(item);
        report.retryLater += due.length - start;
        break;
      }
      const done = new Set<OutboxItem>();
      batch.forEach((item, index) => {
        const result = results[index];
        if (result.status === 'accepted') report.sent += 1;
        else if (result.status === 'duplicate') report.duplicates += 1;
        else report.dropped.push({ key: item.key, status: result.status, reason: result.reason });
        done.add(item);
      });
      this.items = this.items.filter((item) => !done.has(item));
    }
    await this.store.save(this.items);
    return report;
  }

  private reschedule(item: OutboxItem) {
    item.attempts += 1;
    item.nextAttemptAt = this.now() + linkBackoffMs(item.attempts, this.random);
  }
}
