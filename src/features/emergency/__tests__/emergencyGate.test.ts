import { isNewEmergency } from '../EmergencyGate';
import { buildMissingSheet } from '../missingSheet';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: {},
  AndroidNotificationVisibility: {},
  AndroidNotificationPriority: {},
}));

describe('déclenchement de l’écran d’urgence', () => {
  it('ouvre à l’entrée en urgence, y compris à la première observation', () => {
    expect(isNewEmergency(undefined, 'urgence')).toBe(true);
    expect(isNewEmergency('prealerte', 'urgence')).toBe(true);
  });
  it('ne rouvre pas tant que l’état reste en urgence', () => {
    expect(isNewEmergency('urgence', 'urgence')).toBe(false);
    expect(isNewEmergency('urgence', 'prealerte')).toBe(false);
    expect(isNewEmergency('veille', 'prealerte')).toBe(false);
  });
});

describe('fiche disparition', () => {
  const t = (key: string, o?: Record<string, unknown>) => `${key}${o ? JSON.stringify(o) : ''}`;
  it('contient prénom, dernière position, lien carte, zones et contact parent', () => {
    const text = buildMissingSheet({
      t,
      child: { prenom: 'Awa' },
      zone: {
        childId: 'c',
        lastPoint: { lat: 3.8, lon: 11.5, speedKmh: null, accuracyM: null, fixQuality: 'estimee', timestamp: 'x' },
        generatedAt: 'x',
        confidence: 60,
        cells: [],
        topZones: [{ lat: 3.81, lon: 11.51, label: 'Marché central', rank: 1 }],
      },
      lastSeenAt: '2026-09-27T08:00:00Z',
      lastPoint: { lat: 3.8, lon: 11.5 },
      parent: { nom: 'Parent Test', telephone: '+237600000000' },
      formatDateTime: () => '27 sept. 09:00',
    });
    expect(text).toContain('Awa');
    expect(text).toContain('openstreetmap.org/?mlat=3.80000&mlon=11.50000');
    expect(text).toContain('1. Marché central');
    expect(text).toContain('+237600000000');
  });
  it('sans position ni zone : pas de coordonnées inventées', () => {
    const text = buildMissingSheet({ t, child: { prenom: 'Awa' }, zone: null, lastSeenAt: null, lastPoint: null, parent: null, formatDateTime: () => '—' });
    expect(text).not.toContain('openstreetmap');
  });
});
