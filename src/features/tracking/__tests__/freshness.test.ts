import { positionFreshness } from '../freshness';
import type { Position } from '@/models/entities';

const NOW = Date.parse('2026-09-27T12:00:00Z');
const at = (minutesAgo: number, extra: Partial<Position> = {}): Position => ({
  lat: 3.86,
  lon: 11.51,
  speedKmh: 0,
  accuracyM: 10,
  fixQuality: 'gps_recent',
  timestamp: new Date(NOW - minutesAgo * 60_000).toISOString(),
  ...extra,
});

describe('fiabilité de la position (cadence produit 30 min)', () => {
  it('récente dans le cycle de 30 min', () => {
    expect(positionFreshness(at(5), { online: true }, NOW)).toEqual({ freshness: 'recent', ageMinutes: 5 });
  });
  it('estimée après un cycle manqué', () => {
    expect(positionFreshness(at(40), { online: true }, NOW).freshness).toBe('estimated');
  });
  it('perdue après ~2 cycles', () => {
    expect(positionFreshness(at(70), { online: true }, NOW).freshness).toBe('lost');
  });
  it('dispositif hors ligne distingué du GPS perdu', () => {
    expect(positionFreshness(at(70), { online: false }, NOW).freshness).toBe('device_offline');
  });
  it('qualité « perdu » annoncée par le serveur respectée même si récente', () => {
    expect(positionFreshness(at(1, { fixQuality: 'perdu' }), { online: true }, NOW).freshness).toBe('lost');
  });
  it('précision trop faible → estimée', () => {
    expect(positionFreshness(at(1, { accuracyM: 800 }), { online: true }, NOW).freshness).toBe('estimated');
  });
  it('précision inconnue n’est pas pénalisée ni inventée', () => {
    expect(positionFreshness(at(1, { accuracyM: null }), { online: true }, NOW).freshness).toBe('recent');
  });
  it('horodatage dispositif dans le futur (dérive d’horloge) → âge 0', () => {
    expect(positionFreshness(at(-3), { online: true }, NOW)).toEqual({ freshness: 'recent', ageMinutes: 0 });
  });
  it('aucune position', () => {
    expect(positionFreshness(null, { online: true }, NOW).freshness).toBe('none');
    expect(positionFreshness(null, { online: false }, NOW).freshness).toBe('device_offline');
  });
  it('horodatage illisible → estimée, âge inconnu', () => {
    expect(positionFreshness(at(0, { timestamp: 'n/a' }), { online: true }, NOW)).toEqual({ freshness: 'estimated', ageMinutes: null });
  });
});
