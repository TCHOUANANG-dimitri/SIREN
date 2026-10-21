import { linkBackoffMs, linkReducer, LINK_BACKOFF, type LinkState } from '../linkState';
import { Outbox, OUTBOX_LIMITS, type OutboxItem, type OutboxStore, type RelaySender } from '../outbox';
import { DeviceLinkSession } from '../session';
import { SimulatedTransport } from '../transport';

const DEVICE = 'SIREN-ab12C-XY9z0';
const fixedRandom = () => 0.5;

function memoryStore(initial: OutboxItem[] | null = null): OutboxStore & { saved: OutboxItem[] | null } {
  const store = {
    saved: initial,
    load: async () => (store.saved ? JSON.parse(JSON.stringify(store.saved)) : null),
    save: async (items: OutboxItem[]) => {
      store.saved = JSON.parse(JSON.stringify(items));
    },
  };
  return store;
}

function frameAt(ts: string, id = DEVICE) {
  return `${id};4.050000;9.700000;80;3.0;${ts};;;;8;72;90.0`;
}

describe('machine d’états du lien', () => {
  const step = (state: LinkState, ...events: Parameters<typeof linkReducer>[1][]) =>
    events.reduce((s, e) => linkReducer(s, e, DEVICE, fixedRandom), state);

  it('parcours nominal : recherche → connexion → connecté', () => {
    const state = step({ name: 'idle' }, { type: 'start' }, { type: 'found', deviceId: DEVICE }, { type: 'connected', at: 10 });
    expect(state).toEqual({ name: 'connected', deviceId: DEVICE, since: 10 });
  });

  it('ignore un autre boîtier à portée (jamais de relais d’un dispositif non associé)', () => {
    const state = step({ name: 'idle' }, { type: 'start' }, { type: 'found', deviceId: 'SIREN-OTHER-00000' });
    expect(state.name).toBe('searching');
  });

  it('coupure → attente exponentielle bornée, puis nouvelle recherche', () => {
    let state = step({ name: 'idle' }, { type: 'start' }, { type: 'timeout', at: 0 });
    expect(state).toMatchObject({ name: 'backoff', attempt: 1, reason: 'timeout' });
    state = step(state, { type: 'retry' }, { type: 'timeout', at: 0 });
    expect(state).toMatchObject({ name: 'backoff', attempt: 2 });
    expect(linkBackoffMs(50, fixedRandom)).toBeLessThanOrEqual(LINK_BACKOFF.maxMs);
    expect(linkBackoffMs(2, () => 0)).toBe(LINK_BACKOFF.baseMs);
  });

  it('événement inattendu : état inchangé ; stop depuis n’importe quel état', () => {
    const idle: LinkState = { name: 'idle' };
    expect(linkReducer(idle, { type: 'connected', at: 1 }, DEVICE)).toBe(idle);
    expect(step({ name: 'connected', deviceId: DEVICE, since: 1 }, { type: 'stop' })).toEqual({ name: 'idle' });
  });
});

describe('file locale store-and-forward', () => {
  it('persiste, dédoublonne et survit à un redémarrage', async () => {
    const store = memoryStore();
    const outbox = new Outbox(store, () => 1_000);
    expect(await outbox.enqueue(frameAt('2026-10-20T10:00:00Z'))).toBe(true);
    expect(await outbox.enqueue(frameAt('2026-10-20T10:00:00Z'))).toBe(false);
    expect(await outbox.enqueue('x'.repeat(OUTBOX_LIMITS.maxFrameLength + 1))).toBe(false);
    const restarted = new Outbox(store, () => 1_000);
    await restarted.load();
    expect(restarted.size).toBe(1);
  });

  it('relaie par lots ; acceptées et doublons sortent, refus définitifs écartés sans réessai', async () => {
    const outbox = new Outbox(memoryStore(), () => 0);
    for (let i = 0; i < 3; i += 1) await outbox.enqueue(frameAt(`2026-10-20T10:00:0${i}Z`));
    const send: RelaySender = async (frames) =>
      frames.map((_, i) => (i === 0 ? { status: 'accepted' } : i === 1 ? { status: 'duplicate' } : { status: 'rejected', reason: 'lat_invalid' }));
    const report = await outbox.flush(send);
    expect(report).toMatchObject({ sent: 1, duplicates: 1, retryLater: 0 });
    expect(report.dropped).toEqual([expect.objectContaining({ status: 'rejected', reason: 'lat_invalid' })]);
    expect(outbox.size).toBe(0);
  });

  it('réseau indisponible : rien n’est perdu, réessai différé (backoff)', async () => {
    let now = 0;
    const outbox = new Outbox(memoryStore(), () => now, fixedRandom);
    await outbox.enqueue(frameAt('2026-10-20T10:00:00Z'));
    const failing = jest.fn<ReturnType<RelaySender>, Parameters<RelaySender>>().mockRejectedValue(new Error('offline'));
    expect((await outbox.flush(failing)).retryLater).toBe(1);
    expect(outbox.size).toBe(1);
    // Avant l'échéance : pas de nouvel envoi.
    await outbox.flush(failing);
    expect(failing).toHaveBeenCalledTimes(1);
    now = 60_000;
    const ok: RelaySender = async (frames) => frames.map(() => ({ status: 'accepted' as const }));
    expect((await outbox.flush(ok)).sent).toBe(1);
  });

  it('un seul envoi à la fois (deux flush simultanés = un appel serveur)', async () => {
    const outbox = new Outbox(memoryStore(), () => 0);
    await outbox.enqueue(frameAt('2026-10-20T10:00:00Z'));
    const send = jest.fn<ReturnType<RelaySender>, Parameters<RelaySender>>(async (frames) => frames.map(() => ({ status: 'accepted' as const })));
    await Promise.all([outbox.flush(send), outbox.flush(send)]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('TTL : une trame trop ancienne n’est plus relayée', async () => {
    let now = 0;
    const outbox = new Outbox(memoryStore(), () => now);
    await outbox.enqueue(frameAt('2026-10-20T10:00:00Z'));
    now = OUTBOX_LIMITS.ttlMs + 1;
    const send = jest.fn<ReturnType<RelaySender>, Parameters<RelaySender>>(async () => []);
    const report = await outbox.flush(send);
    expect(report.expired).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('taille bornée : les plus anciennes sont écartées au-delà de la limite', async () => {
    const items = Array.from({ length: OUTBOX_LIMITS.maxItems }, (_, i) => ({ key: `k${i}`, frame: `f${i}`, receivedAt: 0, attempts: 0, nextAttemptAt: 0 }));
    const outbox = new Outbox(memoryStore(items), () => 0);
    await outbox.enqueue(frameAt('2026-10-20T10:00:00Z'));
    expect(outbox.size).toBe(OUTBOX_LIMITS.maxItems);
    expect(outbox.snapshot()[0].key).toBe('k1');
  });
});

describe('session de relais (simulateur)', () => {
  it('n’enregistre que les trames du dispositif associé, une fois connecté, puis les relaie telles quelles', async () => {
    const transport = new SimulatedTransport();
    const outbox = new Outbox(memoryStore(), () => 0);
    const sent: string[][] = [];
    const session = new DeviceLinkSession(DEVICE, transport, outbox, async (frames) => {
      sent.push(frames);
      return frames.map(() => ({ status: 'accepted' as const }));
    }, () => 0);
    session.start();
    transport.emitPosition({ lat: 4.05, lon: 9.7, ts: new Date('2026-10-20T10:00:00Z') });
    expect(outbox.size).toBe(0); // pas encore connecté
    transport.discover(DEVICE);
    transport.connect();
    expect(session.state.name).toBe('connected');
    transport.emitPosition({ lat: 4.05, lon: 9.7, ts: new Date('2026-10-20T10:00:05Z'), battery: 80 });
    transport.emit(frameAt('2026-10-20T10:00:06Z', 'SIREN-OTHER-00000'));
    await new Promise((r) => setImmediate(r));
    expect(outbox.size).toBe(1);
    await session.flush();
    expect(sent).toEqual([[`${DEVICE};4.050000;9.700000;80;;2026-10-20T10:00:05Z;;;;;;`]]);
    transport.lose();
    expect(session.state.name).toBe('backoff');
  });
});
