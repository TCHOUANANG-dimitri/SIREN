import { getDb, mutateDb, genId } from '../mock/db';
import { ApiError, simulateLatency } from '../network';
import { assertChildAccess, assertPrincipal, resolveCurrentUser } from '../mock/session';
import type { Geofence } from '@/models/entities';

export async function listGeofences(token: string | null, childId: string): Promise<Geofence[]> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  return getDb().geofences.filter((g) => g.childId === childId);
}

export async function createGeofence(
  token: string | null,
  childId: string,
  input: Omit<Geofence, 'id' | 'childId'>
): Promise<Geofence> {
  await simulateLatency(300, 600);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  assertPrincipal(user); // "Définir/modifier périmètres" réservé au principal — CDC §7.2
  const geofence: Geofence = { id: genId('geo'), childId, ...input };
  mutateDb((d) => {
    d.geofences.push(geofence);
  });
  return geofence;
}

export async function patchGeofence(
  token: string | null,
  geofenceId: string,
  patch: Partial<Omit<Geofence, 'id' | 'childId'>>
): Promise<Geofence> {
  await simulateLatency(200, 500);
  const user = resolveCurrentUser(token);
  const db = getDb();
  const geofence = db.geofences.find((g) => g.id === geofenceId);
  if (!geofence) throw new ApiError('Périmètre introuvable', 404);
  assertChildAccess(geofence.childId, user);
  assertPrincipal(user);
  mutateDb((d) => {
    const target = d.geofences.find((g) => g.id === geofenceId);
    if (target) Object.assign(target, patch);
  });
  return { ...geofence, ...patch };
}

export async function deleteGeofence(token: string | null, geofenceId: string): Promise<{ deleted: true }> {
  await simulateLatency(200, 500);
  const user = resolveCurrentUser(token);
  const db = getDb();
  const geofence = db.geofences.find((g) => g.id === geofenceId);
  if (!geofence) throw new ApiError('Périmètre introuvable', 404);
  assertChildAccess(geofence.childId, user);
  assertPrincipal(user);
  mutateDb((d) => {
    d.geofences = d.geofences.filter((g) => g.id !== geofenceId);
  });
  return { deleted: true };
}
