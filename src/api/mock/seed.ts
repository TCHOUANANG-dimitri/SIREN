import type { DbShape } from './db';

/**
 * Données de démonstration — contexte camerounais (Yaoundé), cohérent avec la mémoire
 * projet (réseau 2G, couverture instable, terrain africain).
 */
const now = () => new Date().toISOString();

const HOME = { lat: 3.8667, lon: 11.5167 };
const SCHOOL = { lat: 3.872, lon: 11.523 };

export function buildSeed(): DbShape {
  const parentId = 'user_parent_demo';
  const secondaryUserId = 'user_secondary_demo';
  const leaId = 'child_lea_demo';
  const noahId = 'child_noah_demo';

  return {
    users: [
      {
        id: parentId,
        nom: 'Marie Ngo',
        email: 'marie@example.com',
        telephone: '+237 6 90 12 34 56',
        role: 'principal',
        langue: 'fr',
        createdAt: now(),
      },
      {
        id: secondaryUserId,
        nom: 'Rose (Grand-mère)',
        email: 'rose@example.com',
        telephone: '+237 6 77 22 11 00',
        role: 'secondaire',
        langue: 'fr',
        createdAt: now(),
      },
    ],
    children: [
      {
        id: leaId,
        prenom: 'Léa',
        deviceId: 'SIREN-A4F2-7C81',
        parentId,
        modelConfidence: 8,
        createdAt: now(),
      },
      {
        id: noahId,
        prenom: 'Noah',
        deviceId: 'SIREN-B821-33F0',
        parentId,
        modelConfidence: 85,
        createdAt: now(),
      },
    ],
    devices: [
      {
        deviceId: 'SIREN-A4F2-7C81',
        battery: 92,
        online: true,
        lastSeen: now(),
        fixQuality: 'gps_recent',
        configVersion: 3,
        firmwareVersion: '1.4.2',
        energyMode: 'equilibre',
        sensitivity: 50,
      },
      {
        deviceId: 'SIREN-B821-33F0',
        battery: 78,
        online: true,
        lastSeen: now(),
        fixQuality: 'gps_recent',
        configVersion: 3,
        firmwareVersion: '1.4.2',
        energyMode: 'economie',
        sensitivity: 50,
      },
      {
        deviceId: 'SIREN-C910-45E2',
        battery: 88,
        online: true,
        lastSeen: now(),
        fixQuality: 'gps_recent',
        configVersion: 3,
        firmwareVersion: '1.4.2',
        energyMode: 'equilibre',
        sensitivity: 50,
      },
    ],
    positions: {
      [leaId]: [
        { lat: HOME.lat, lon: HOME.lon, speedKmh: 0, timestamp: now(), accuracyM: 12, fixQuality: 'gps_recent' },
      ],
      [noahId]: [
        { lat: HOME.lat + 0.001, lon: HOME.lon + 0.001, speedKmh: 0, timestamp: now(), accuracyM: 10, fixQuality: 'gps_recent' },
      ],
    },
    places: [
      {
        id: 'place_maison_lea',
        childId: leaId,
        nom: 'Maison',
        lat: HOME.lat,
        lon: HOME.lon,
        radiusM: 80,
        source: 'declare',
        icon: 'maison',
      },
      {
        id: 'place_ecole_lea',
        childId: leaId,
        nom: 'École',
        lat: SCHOOL.lat,
        lon: SCHOOL.lon,
        radiusM: 100,
        source: 'declare',
        icon: 'ecole',
        schedule: [{ jours: [1, 2, 3, 4, 5], heureDebut: '07:00', heureFin: '15:30' }],
      },
      {
        id: 'place_maison_noah',
        childId: noahId,
        nom: 'Maison',
        lat: HOME.lat,
        lon: HOME.lon,
        radiusM: 80,
        source: 'declare',
        icon: 'maison',
      },
    ],
    geofences: [
      {
        id: 'geo_quartier_lea',
        childId: leaId,
        nom: 'Quartier autorisé',
        type: 'autorise',
        lat: HOME.lat,
        lon: HOME.lon,
        radiusM: 1500,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ],
    riskScores: {
      [leaId]: {
        childId: leaId,
        score: 5,
        state: 'veille',
        confidence: 8,
        reasons: [],
        subScores: { geo: 0, mouvement: 0, universel: 0, declaratif: 0 },
        timestamp: now(),
      },
      [noahId]: {
        childId: noahId,
        score: 3,
        state: 'veille',
        confidence: 85,
        reasons: [],
        subScores: { geo: 0, mouvement: 0, universel: 0, declaratif: 0 },
        timestamp: now(),
      },
    },
    riskHistory: { [leaId]: [], [noahId]: [] },
    alerts: [],
    secondaryAccess: [
      {
        id: 'share_rose_lea',
        childId: leaId,
        userId: secondaryUserId,
        nom: 'Rose (Grand-mère)',
        permissions: ['etat_zone', 'alertes_prealerte'],
        invitedAt: now(),
        status: 'actif',
      },
    ],
    accessAudit: [],
    communityReports: [
      {
        id: 'report_1',
        description: 'Véhicule suspect stationné près de l’école, plusieurs soirs de suite.',
        lat: SCHOOL.lat + 0.001,
        lon: SCHOOL.lon,
        createdAt: now(),
        authorNom: 'Voisin du quartier',
      },
    ],
    emergencyContacts: [
      { id: 'contact_1', childId: leaId, nom: 'Papa (Jean)', telephone: '+237 6 55 44 33 22' },
      { id: 'contact_2', childId: leaId, nom: 'Rose (Grand-mère)', telephone: '+237 6 77 22 11 00' },
    ],
    audioLogs: [],
    searchZones: {},
    passwordsByEmail: {
      'marie@example.com': 'Password123!',
      'rose@example.com': 'Password123!',
    },
  };
}

export const DEMO_IDS = {
  parentId: 'user_parent_demo',
  secondaryUserId: 'user_secondary_demo',
  leaId: 'child_lea_demo',
  noahId: 'child_noah_demo',
};

export const DEMO_HOME = HOME;
export const DEMO_SCHOOL = SCHOOL;
