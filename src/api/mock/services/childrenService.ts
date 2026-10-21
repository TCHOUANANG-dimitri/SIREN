import { getDb, mutateDb, genId } from '../db';
import { ApiError, reasonError } from '../../errors';
import { isValidSerial } from '@/features/pairing/serial';
import { simulateLatency } from '../helpers';
import { assertChildAccess, resolveCurrentUser } from '../session';
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
  input: { prenom: string; deviceId: string; photoUrl?: string; activationPin?: string }
): Promise<Child> {
  await simulateLatency(400, 900);
  const user = resolveCurrentUser(token);
  const db = getDb();
  assertPairable(user.id, input.deviceId, input.activationPin);

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

/**
 * PIN d'activation de démonstration, imprimé sur la boîte des boîtiers « neufs »
 * créés à la volée (les boîtiers du jeu de démo n'en ont pas, comme un serveur v1).
 */
export const DEMO_ACTIVATION_PIN = 'K7Q2M9';
const devicesWithPin = new Set<string>();

export function pinRequired(deviceId: string): boolean {
  return devicesWithPin.has(deviceId);
}

/** Même règles que le serveur (children.resolve_device_for_pairing). */
function assertPairable(userId: string, deviceId: string, pin: string | undefined, forChildId?: string) {
  if (!isValidSerial(deviceId)) throw reasonError('serial_invalid', 422);
  const db = getDb();
  const device = db.devices.find((d) => d.deviceId === deviceId);
  if (!device) throw reasonError('device_not_found', 404);
  const holder = db.children.find((c) => c.deviceId === deviceId);
  if (holder && (holder.id === forChildId || holder.parentId === userId)) throw reasonError('device_already_paired', 409);
  if (pinRequired(deviceId)) {
    if (!pin) throw reasonError('pin_required', 403);
    if (pin.trim() !== DEMO_ACTIVATION_PIN) throw reasonError('pin_invalid', 403);
    if (holder) throw reasonError('device_taken', 409);
  } else if (holder) {
    throw reasonError('device_not_found', 404);
  }
}

export async function pairDevice(
  token: string | null,
  childId: string,
  input: { deviceId: string; activationPin?: string }
): Promise<Child> {
  await simulateLatency(400, 900);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  if (user.role !== 'principal') throw reasonError('principal_only', 403);
  assertPairable(user.id, input.deviceId, input.activationPin, childId);
  let updated: Child | undefined;
  mutateDb((d) => {
    const target = d.children.find((c) => c.id === childId);
    if (target) {
      target.deviceId = input.deviceId;
      updated = { ...target };
    }
  });
  if (!updated) throw new ApiError(i18n.t('errors.childNotFound'), 404);
  return updated;
}

export async function unpairDevice(token: string | null, childId: string): Promise<Child> {
  await simulateLatency(300, 600);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  if (user.role !== 'principal') throw reasonError('principal_only', 403);
  let updated: Child | undefined;
  mutateDb((d) => {
    const target = d.children.find((c) => c.id === childId);
    if (target) {
      if (!target.deviceId) throw reasonError('no_device', 404);
      target.deviceId = '';
      updated = { ...target };
    }
  });
  if (!updated) throw new ApiError(i18n.t('errors.childNotFound'), 404);
  return updated;
}

/** Simule la recherche d'un dispositif par son numéro lors de l'appairage (étape 2). Sensible à la casse. */
export async function findDeviceById(deviceId: string): Promise<DeviceStatus> {
  await simulateLatency(500, 1100);
  const db = getDb();
  const serial = deviceId.trim();
  if (!isValidSerial(serial)) throw reasonError('serial_invalid', 422);
  let device = db.devices.find((d) => d.deviceId === serial);

  if (!device) {
    // Démo : tout numéro au bon format est accepté comme un boîtier neuf, avec PIN d'activation.
    device = {
      deviceId: serial,
      battery: 80 + Math.floor(Math.random() * 18),
      online: true,
      lastSeen: new Date().toISOString(),
      fixQuality: 'gps_recent',
      configVersion: 1,
      firmwareVersion: '1.4.2',
      energyMode: 'equilibre',
      sensitivity: 50,
    };
    devicesWithPin.add(serial);
    mutateDb((d) => {
      d.devices.push(device!);
    });
  }

  // Même réponse qu'un numéro inconnu : on ne révèle pas qu'un boîtier est suivi par une autre famille.
  if (db.children.some((c) => c.deviceId === device!.deviceId)) throw reasonError('device_not_found', 404);
  return device;
}
