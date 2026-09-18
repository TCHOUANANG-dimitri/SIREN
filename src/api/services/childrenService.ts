import { getDb, mutateDb, genId } from '../mock/db';
import { ApiError, simulateLatency } from '../network';
import { assertChildAccess, resolveCurrentUser } from '../mock/session';
import type { Child, DeviceStatus } from '@/models/entities';
import i18n from '@/i18n';

export async function listChildren(token: string | null): Promise<Child[]> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  const db = getDb();
  if (user.role === 'principal') {
    return db.children.filter((c) => c.parentId === user.id);
  }
  const childIds = db.secondaryAccess
    .filter((s) => s.userId === user.id && s.status === 'actif')
    .map((s) => s.childId);
  return db.children.filter((c) => childIds.includes(c.id));
}

/** Point de départ des enfants créés dans l'app (Yaoundé), aligné sur le jeu de démo. */
const DEFAULT_ORIGIN = { lat: 3.8667, lon: 11.5167 };

export async function createChild(
  token: string | null,
  input: { prenom: string; deviceId: string; photoUrl?: string }
): Promise<Child> {
  await simulateLatency(400, 900);
  const user = resolveCurrentUser(token);
  const db = getDb();
  const device = db.devices.find((d) => d.deviceId === input.deviceId);
  if (!device) throw new ApiError(i18n.t('errors.deviceNotFound'), 404);
  const alreadyLinked = db.children.some((c) => c.deviceId === input.deviceId);
  if (alreadyLinked) throw new ApiError(i18n.t('errors.deviceNotFound'), 409);

  // Unicité du prénom au sein d'un même parent : deux familles distinctes
  // peuvent légitimement avoir un « Paul », mais un parent qui enregistre deux
  // « Paul » ne saurait plus les distinguer dans les alertes.
  const normalized = input.prenom.trim().toLocaleLowerCase();
  const duplicateName = db.children.some(
    (c) => c.parentId === user.id && c.prenom.trim().toLocaleLowerCase() === normalized
  );
  if (duplicateName) {
    throw new ApiError(i18n.t('errors.duplicateChildName'), 409);
  }

  const child: Child = {
    id: genId('child'),
    prenom: input.prenom,
    deviceId: input.deviceId,
    photoUrl: input.photoUrl,
    parentId: user.id,
    modelConfidence: 5,
    createdAt: new Date().toISOString(),
  };
  mutateDb((d) => {
    d.children.push(child);
    // Une position initiale est indispensable : le dispositif est annoncé « en
    // ligne, GPS actif » dès l'appairage, et getPosition lève une 404 tant que
    // l'historique est vide — l'onglet Carte restait alors bloqué sur son
    // squelette de chargement, sans jamais afficher la carte.
    d.positions[child.id] = [
      {
        lat: DEFAULT_ORIGIN.lat,
        lon: DEFAULT_ORIGIN.lon,
        speedKmh: 0,
        timestamp: new Date().toISOString(),
        accuracyM: 14,
        fixQuality: 'gps_recent',
      },
    ];
    d.riskScores[child.id] = {
      childId: child.id,
      score: 0,
      state: 'veille',
      confidence: 5,
      reasons: [],
      subScores: { geo: 0, mouvement: 0, universel: 0, declaratif: 0 },
      timestamp: new Date().toISOString(),
    };
    d.riskHistory[child.id] = [];
  });
  return child;
}

export async function getChildStatus(token: string | null, childId: string): Promise<DeviceStatus> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  const db = getDb();
  const child = db.children.find((c) => c.id === childId);
  const device = db.devices.find((d) => d.deviceId === child?.deviceId);
  if (!device) throw new ApiError(i18n.t('errors.deviceMissing'), 404);
  return device;
}

export async function patchChildContext(
  token: string | null,
  childId: string,
  patch: Partial<Pick<Child, 'sleepSchedule'>>
): Promise<Child> {
  await simulateLatency(200, 500);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  const db = getDb();
  const child = db.children.find((c) => c.id === childId);
  if (!child) throw new ApiError(i18n.t('errors.childNotFound'), 404);
  mutateDb((d) => {
    const target = d.children.find((c) => c.id === childId);
    if (target) Object.assign(target, patch);
  });
  return { ...child, ...patch };
}

const DEVICE_ID_PATTERN = /^SIREN-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

/** Simule la recherche d'un dispositif par son identifiant lors de l'appairage (étape 2). */
export async function findDeviceById(deviceId: string): Promise<DeviceStatus> {
  await simulateLatency(500, 1100);
  const db = getDb();
  const normalized = deviceId.trim().toUpperCase();
  let device = db.devices.find((d) => d.deviceId === normalized);

  if (!device && DEVICE_ID_PATTERN.test(normalized)) {
    // Démo : tout identifiant au bon format est accepté comme un dispositif neuf en ligne.
    device = {
      deviceId: normalized,
      battery: 80 + Math.floor(Math.random() * 18),
      online: true,
      lastSeen: new Date().toISOString(),
      fixQuality: 'gps_recent',
      configVersion: 1,
      firmwareVersion: '1.4.2',
      energyMode: 'equilibre',
      sensitivity: 50,
    };
    mutateDb((d) => {
      d.devices.push(device!);
    });
  }

  if (!device) throw new ApiError(i18n.t('errors.deviceNotFound'), 404);
  const alreadyLinked = db.children.some((c) => c.deviceId === device!.deviceId);
  if (alreadyLinked) throw new ApiError(i18n.t('errors.deviceNotFound'), 409);
  return device;
}
