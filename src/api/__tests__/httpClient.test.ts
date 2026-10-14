import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { configureSession, http, setHttpInstance } from '../http/client';
import { ApiError } from '../errors';

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data?: unknown } | 'network' | 'timeout';

function install(handler: Handler) {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config);
    const result = handler(config);
    if (result === 'network') throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    if (result === 'timeout') throw new AxiosError('timeout', 'ECONNABORTED', config);
    const response = { data: result.data, status: result.status, statusText: '', headers: {}, config };
    if (result.status >= 400) throw new AxiosError('fail', 'ERR_BAD_RESPONSE', config, undefined, response);
    return response;
  };
  setHttpInstance(axios.create({ baseURL: 'https://api.test/api/v1', adapter }));
  return calls;
}

function session(overrides: Partial<Parameters<typeof configureSession>[0]> = {}) {
  let access = 'access-1';
  const bridge = {
    getAccessToken: () => access,
    getRefreshToken: () => 'refresh-1',
    onTokensRefreshed: jest.fn(async ({ accessToken }: { accessToken: string }) => {
      access = accessToken;
    }),
    onSessionExpired: jest.fn(),
    ...overrides,
  };
  configureSession(bridge);
  return bridge;
}

beforeEach(() => {
  jest.useRealTimers();
});

describe('client HTTP', () => {
  it('ajoute le jeton et une clé d’idempotence sur les écritures', async () => {
    session();
    const calls = install(() => ({ status: 200, data: { ok: true } }));
    await http.post('/children', { prenom: 'Awa' });
    expect(calls[0].headers.Authorization).toBe('Bearer access-1');
    expect(calls[0].headers['Idempotency-Key']).toEqual(expect.any(String));
  });

  it('n’envoie pas de jeton sur les routes skipAuth', async () => {
    session();
    const calls = install(() => ({ status: 200, data: {} }));
    await http.post('/auth/login', {}, { skipAuth: true });
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it('rafraîchit une seule fois pour des 401 concurrents puis rejoue', async () => {
    const bridge = session();
    let refreshCalls = 0;
    install((config) => {
      if (config.url === '/auth/refresh') {
        refreshCalls += 1;
        return { status: 200, data: { accessToken: 'access-2' } };
      }
      return config.headers.Authorization === 'Bearer access-2' ? { status: 200, data: { ok: config.url } } : { status: 401 };
    });
    const results = await Promise.all([http.get('/a'), http.get('/b'), http.get('/c')]);
    expect(results).toEqual([{ ok: '/a' }, { ok: '/b' }, { ok: '/c' }]);
    expect(refreshCalls).toBe(1);
    expect(bridge.onTokensRefreshed).toHaveBeenCalledTimes(1);
  });

  it('expire la session si le rafraîchissement échoue', async () => {
    const bridge = session();
    install((config) => (config.url === '/auth/refresh' ? { status: 401 } : { status: 401 }));
    await expect(http.get('/children')).rejects.toMatchObject({ code: 'session_expired', status: 401 });
    expect(bridge.onSessionExpired).toHaveBeenCalled();
  });

  it('ne tente pas de rafraîchir sur un 401 de connexion (mauvais identifiants)', async () => {
    const bridge = session();
    install(() => ({ status: 401 }));
    await expect(
      http.post('/auth/login', {}, { skipAuth: true, messages: { unauthorized: 'Identifiants incorrects' } })
    ).rejects.toMatchObject({ code: 'unauthorized', message: 'Identifiants incorrects' });
    expect(bridge.onSessionExpired).not.toHaveBeenCalled();
  });

  it('rejoue une lecture après une coupure réseau', async () => {
    session();
    let n = 0;
    install(() => (++n < 2 ? 'network' : { status: 200, data: 'ok' }));
    await expect(http.get('/x')).resolves.toBe('ok');
    expect(n).toBe(2);
  });

  it('ne rejoue JAMAIS une écriture après une coupure (risque de double action)', async () => {
    session();
    let n = 0;
    install(() => {
      n += 1;
      return 'network';
    });
    await expect(http.post('/children/c1/disappearance')).rejects.toMatchObject({ code: 'network' });
    expect(n).toBe(1);
  });

  it('convertit délai dépassé, 403, 404, 409 et 5xx en erreurs présentables', async () => {
    session();
    install(() => 'timeout');
    await expect(http.post('/x')).rejects.toMatchObject({ code: 'timeout' });
    for (const [status, code] of [
      [403, 'forbidden'],
      [404, 'not_found'],
      [409, 'conflict'],
    ] as const) {
      install(() => ({ status, data: { detail: 'Détail serveur interne' } }));
      const error = (await http.post('/x').catch((e) => e)) as ApiError;
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe(code);
      // Le détail serveur brut n'est jamais montré à l'utilisateur.
      expect(error.message).not.toContain('Détail serveur interne');
    }
  });
});
