import { createWsChannel, parseServerMessage } from '../realtime/wsChannel';
import type { RealtimeEvent } from '../realtime/types';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function setup(token: string | null = 'tok') {
  FakeSocket.instances = [];
  const refreshToken = jest.fn(async () => 'tok-2');
  const channel = createWsChannel({
    url: 'wss://api.test/api/v1/ws',
    getToken: () => token,
    refreshToken,
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
    heartbeatMs: 1000,
  });
  const events: RealtimeEvent[] = [];
  channel.subscribe((e) => events.push(e));
  return { channel, events, refreshToken };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('canal WebSocket', () => {
  it('ouvre une socket authentifiée par enfant suivi', () => {
    const { channel } = setup();
    channel.watch(['c1', 'c2']);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[0].url).toBe('wss://api.test/api/v1/ws?token=tok&childId=c1');
  });

  it('normalise risk_update et signale la connexion', () => {
    const { channel, events } = setup();
    channel.watch(['c1']);
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].receive({ event: 'risk_update', data: { score: 74, state: 'urgence', reasons: ['trajet inconnu'] } });
    expect(events).toContainEqual({ type: 'connection', status: 'connected' });
    expect(events).toContainEqual({
      type: 'risk_update',
      childId: 'c1',
      score: 74,
      state: 'urgence',
      reasons: ['trajet inconnu'],
      risk: null,
    });
  });

  it('déduplique un message rejoué (diffusion directe + Redis)', () => {
    const { channel, events } = setup();
    channel.watch(['c1']);
    const s = FakeSocket.instances[0];
    s.open();
    const msg = { event: 'risk_update', data: { score: 40, state: 'prealerte', reasons: [] } };
    s.receive(msg);
    s.receive(msg);
    expect(events.filter((e) => e.type === 'risk_update')).toHaveLength(1);
  });

  it('reconnecte avec backoff après une coupure', () => {
    const { channel, events } = setup();
    channel.watch(['c1']);
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].drop();
    expect(events.at(-1)).toEqual({ type: 'connection', status: 'reconnecting' });
    jest.advanceTimersByTime(1100);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1].open();
    expect(events.at(-1)).toEqual({ type: 'connection', status: 'connected' });
  });

  it('ne boucle pas sur un refus d’authentification : rafraîchit puis rouvre', async () => {
    const { channel, refreshToken } = setup();
    channel.watch(['c1']);
    FakeSocket.instances[0].drop(4001);
    jest.advanceTimersByTime(60_000);
    expect(refreshToken).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('envoie un battement de cœur', () => {
    const { channel } = setup();
    channel.watch(['c1']);
    FakeSocket.instances[0].open();
    jest.advanceTimersByTime(2100);
    expect(FakeSocket.instances[0].sent).toEqual(['ping', 'ping']);
  });

  it('ferme proprement les sockets des enfants retirés', () => {
    const { channel } = setup();
    channel.watch(['c1', 'c2']);
    FakeSocket.instances.forEach((s) => s.open());
    channel.watch(['c2']);
    jest.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[0].readyState).toBe(3);
  });

  it('ignore les messages inconnus ou mal formés', () => {
    expect(parseServerMessage('c1', 'pas du json')).toBeNull();
    expect(parseServerMessage('c1', JSON.stringify({ event: 'inconnu', data: {} }))).toBeNull();
    expect(parseServerMessage('c1', JSON.stringify({ event: 'risk_update', data: {} }))).toBeNull();
  });

  it('position partielle serveur → invalidation (pas de précision inventée)', () => {
    const e = parseServerMessage('c1', JSON.stringify({ event: 'position_update', data: { lat: 3.8, lon: 11.5, speedKmh: 4, ts: 'x' } }));
    expect(e).toEqual({ type: 'position_update', childId: 'c1', position: null });
  });
});
