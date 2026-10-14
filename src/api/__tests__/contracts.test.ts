import {
  alertSchema,
  childSchema,
  deviceStatusSchema,
  parseContract,
  parseContractList,
  positionSchema,
  riskHistorySchema,
  riskScoreSchema,
  searchZoneSchema,
  shareSchema,
  stateForScore,
  zoneStateSchema,
} from '../contracts';
import { ApiError } from '../errors';

// Charges utiles synthétiques calquées sur les réponses de server/app/api/v1.
const serverPosition = {
  lat: 3.8667,
  lon: 11.5167,
  speedKmh: null,
  accuracyM: 12,
  heading: null,
  fixQuality: 'gps_recent',
  battery: 81,
  ts: '2026-09-27T08:00:00+00:00',
};

describe('contrat serveur → app v1', () => {
  it('normalise une position serveur (ts → timestamp, champs absents → null)', () => {
    const p = parseContract(positionSchema, serverPosition, 'test');
    expect(p.timestamp).toBe('2026-09-27T08:00:00+00:00');
    expect(p.speedKmh).toBeNull();
    expect(p.accuracyM).toBe(12);
  });

  it('accepte les champs supplémentaires sans les propager', () => {
    const p = parseContract(positionSchema, { ...serverPosition, futureField: 'x' }, 'test');
    expect(p).not.toHaveProperty('futureField');
  });

  it('rejette une position sans horodatage (erreur de contrat)', () => {
    const { ts: _ts, ...noTs } = serverPosition;
    expect(() => parseContract(positionSchema, noTs, 'test')).toThrow(ApiError);
    try {
      parseContract(positionSchema, noTs, 'test');
    } catch (e) {
      expect((e as ApiError).code).toBe('contract');
    }
  });

  it('rejette des coordonnées hors plage', () => {
    expect(() => parseContract(positionSchema, { ...serverPosition, lat: 91 }, 'test')).toThrow(ApiError);
  });

  it('ne présente jamais comme récente une qualité GPS inconnue', () => {
    const p = parseContract(positionSchema, { ...serverPosition, fixQuality: 'gnss_v2' }, 'test');
    expect(p.fixQuality).toBe('estimee');
  });

  it('recalcule un état de risque inconnu depuis le score', () => {
    const r = parseContract(riskScoreSchema, { childId: 'c1', score: 82, state: 'rouge', reasons: [], timestamp: null }, 'test');
    expect(r.state).toBe('urgence');
    expect(r.timestamp).toBeNull();
    expect(r.subScores).toEqual({ geo: 0, mouvement: 0, universel: 0, declaratif: 0 });
  });

  it('borne les scores à 0..100', () => {
    const r = parseContract(riskScoreSchema, { childId: 'c1', score: 140, state: 'urgence', timestamp: 'x' }, 'test');
    expect(r.score).toBe(100);
  });

  it('accepte l’historique de risque encapsulé ({ scores }) ou nu', () => {
    const item = { childId: 'c1', score: 10, state: 'veille', timestamp: '2026-09-27T08:00:00Z' };
    expect(parseContract(riskHistorySchema, { scores: [item] }, 't')).toHaveLength(1);
    expect(parseContract(riskHistorySchema, [item], 't')).toHaveLength(1);
  });

  it('seuils 30 / 70 : veille < 30, pré-alerte 30–69, urgence ≥ 70', () => {
    expect(stateForScore(29)).toBe('veille');
    expect(stateForScore(30)).toBe('prealerte');
    expect(stateForScore(69)).toBe('prealerte');
    expect(stateForScore(70)).toBe('urgence');
  });

  it('mappe le statut dispositif serveur (énergie / sensibilité non reconnues → null)', () => {
    const d = parseContract(
      deviceStatusSchema,
      {
        deviceId: 'SIREN-AB12-CD34',
        battery: null,
        online: true,
        lastSeen: null,
        fixQuality: 'gps_recent',
        configVersion: 2,
        firmwareVersion: null,
        energyMode: 'normal',
        sensitivity: 'normal',
      },
      't'
    );
    expect(d.energyMode).toBeNull();
    expect(d.sensitivity).toBeNull();
    expect(d.battery).toBeNull();
  });

  it('accepte une sensibilité numérique stockée en texte par le serveur', () => {
    const d = parseContract(
      deviceStatusSchema,
      { deviceId: 'x', online: false, fixQuality: 'perdu', configVersion: 1, energyMode: 'economie', sensitivity: '65' },
      't'
    );
    expect(d.sensitivity).toBe(65);
    expect(d.energyMode).toBe('economie');
  });

  it('ignore les permissions inconnues (moindre privilège)', () => {
    const s = parseContract(
      shareSchema,
      { id: 's', childId: 'c', userId: 'u', nom: 'N', permissions: ['historique', 'admin_total'], status: 'actif', invitedAt: 'x' },
      't'
    );
    expect(s.permissions).toEqual(['historique']);
  });

  it('dérive le niveau d’alerte depuis le score si le niveau est inconnu', () => {
    const a = parseContract(alertSchema, { id: 'a', childId: 'c', level: 'critique', score: 75, status: 'active', createdAt: 'x' }, 't');
    expect(a.level).toBe('urgence');
    expect(a.reasons).toEqual([]);
  });

  it('état de zone serveur : pas de coordonnées, zone interdite signalée', () => {
    const z = parseContract(zoneStateSchema, { inSafeZone: false, zoneName: 'Marché' }, 't');
    expect(z).toEqual({ inZone: true, zoneName: 'Marché', inForbiddenZone: true, asOf: null });
    expect(z).not.toHaveProperty('lat');
  });

  it('zone de recherche vide renvoyée par le serveur → null (pas encore calculée)', () => {
    const empty = { childId: 'c', lastPoint: { lat: 0, lon: 0 }, generatedAt: null, confidence: 0, cells: [], topZones: [] };
    expect(parseContract(searchZoneSchema, empty, 't')).toBeNull();
  });

  it('liste : un élément invalide est écarté, les autres conservés', () => {
    const onInvalid = jest.fn();
    const out = parseContractList(
      childSchema,
      [
        { id: 'c1', prenom: 'Awa', deviceId: 'D', parentId: 'p', modelConfidence: 12, createdAt: 'x' },
        { id: 'c2', parentId: 'p' },
      ],
      't',
      onInvalid
    );
    expect(out).toHaveLength(1);
    expect(onInvalid).toHaveBeenCalledWith(1, expect.any(Array));
  });
});
