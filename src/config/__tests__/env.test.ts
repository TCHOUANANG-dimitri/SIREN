import { buildConfig } from '../env';

describe('validation de la configuration', () => {
  it('par défaut : mock, sans erreur bloquante', () => {
    const { env, issues } = buildConfig({});
    expect(env.apiMode).toBe('mock');
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('valeur de mode inconnue → mock + avertissement (pas de crash)', () => {
    const { env, issues } = buildConfig({ apiMode: 'prod' });
    expect(env.apiMode).toBe('mock');
    expect(issues[0].severity).toBe('warning');
  });

  it('live : HTTPS et WSS obligatoires hors poste local', () => {
    const { issues } = buildConfig({ apiMode: 'live', apiBaseUrl: 'http://siren.example.com', wsUrl: 'ws://siren.example.com/ws' });
    expect(issues.map((i) => i.key)).toEqual(['EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_WS_URL']);
  });

  it('live local (émulateur Android) autorisé en clair', () => {
    const { issues } = buildConfig({ apiMode: 'live', apiBaseUrl: 'http://10.0.2.2:8000', wsUrl: 'ws://10.0.2.2:8000/api/v1/ws' });
    expect(issues).toHaveLength(0);
  });

  it('interdit le mock dans une build de production', () => {
    const { issues } = buildConfig({ appEnv: 'production', apiMode: 'mock' });
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('ignore les clés d’exemple non renseignées', () => {
    const { env } = buildConfig({ mapsApiKey: 'VOTRE_CLE_API_GOOGLE_MAPS_ICI' });
    expect(env.mapsApiKey).toBeUndefined();
  });

  it('feature flags : audio bloqué en live tant que non activé explicitement', () => {
    expect(buildConfig({ apiMode: 'live', apiBaseUrl: 'https://a.b', wsUrl: 'wss://a.b/ws' }).featureFlags.audio).toBe(false);
    expect(buildConfig({ apiMode: 'live', apiBaseUrl: 'https://a.b', wsUrl: 'wss://a.b/ws', featureAudio: 'true' }).featureFlags.audio).toBe(true);
  });

  it('URL de base normalisée sans slash final', () => {
    expect(buildConfig({ apiBaseUrl: 'https://api.siren.cm/' }).env.apiBaseUrl).toBe('https://api.siren.cm');
  });

  it('une variable vide dans .env applique la valeur par défaut', () => {
    const { featureFlags } = buildConfig({ featureFaucon: '', fauconUrl: 'https://faucon.example', apiMode: 'live', apiBaseUrl: 'https://a.b', wsUrl: 'wss://a.b/ws', featureWebsocket: '' });
    expect(featureFlags.faucon).toBe(true);
    expect(featureFlags.websocket).toBe(true);
  });

  it('WS vide (o2switch mutualisé) : pas de temps réel, polling', () => {
    const { env, featureFlags, issues } = buildConfig({ apiMode: 'live', apiBaseUrl: 'https://api.siren.cm', wsUrl: '' });
    expect(env.wsUrl).toBe('');
    expect(featureFlags.websocket).toBe(false);
    expect(issues).toHaveLength(0);
  });
});
