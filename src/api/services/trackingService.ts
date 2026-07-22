import { getDb } from '../mock/db';
import { ApiError, simulateLatency } from '../network';
import { assertChildAccess, assertPermission, resolveCurrentUser } from '../mock/session';
import { requestImmediateFix } from '../mock/scenarioEngine';
import { logAccess } from './sharingService';
import { haversineDistanceM } from '@/utils/geo';
import type { Position } from '@/models/entities';

export async function getPosition(token: string | null, childId: string): Promise<Position> {
  await simulateLatency(150, 400);
  const user = resolveCurrentUser(token);
  const perms = assertChildAccess(childId, user);
  assertPermission(perms, 'position_precise');
  const hist = getDb().positions[childId];
  const last = hist?.[hist.length - 1];
  if (!last) throw new ApiError('Position indisponible', 404);
  if (user.role === 'secondaire') logAccess(childId, user.id, user.nom, 'Position précise');
  return last;
}

export async function requestPositionFix(token: string | null, childId: string): Promise<{ accepted: true }> {
  await simulateLatency(100, 250);
  const user = resolveCurrentUser(token);
  const perms = assertChildAccess(childId, user);
  assertPermission(perms, 'position_precise');
  requestImmediateFix(childId);
  return { accepted: true };
}

export interface ZoneState {
  inZone: boolean;
  zoneName: string | null;
  asOf: string;
}

/**
 * Vue "état de zone" pour un secondaire n'ayant pas le droit position_precise — CDC1 §9.25 :
 * "l'écran affiche 'Dans la zone École' sans carte précise." Ne renvoie jamais lat/lon.
 */
export async function getZoneState(token: string | null, childId: string): Promise<ZoneState> {
  await simulateLatency(150, 350);
  const user = resolveCurrentUser(token);
  const perms = assertChildAccess(childId, user);
  assertPermission(perms, 'etat_zone');
  const db = getDb();
  const hist = db.positions[childId];
  const last = hist?.[hist.length - 1];
  if (!last) throw new ApiError('Position indisponible', 404);
  const places = db.places.filter((p) => p.childId === childId);
  const geofences = db.geofences.filter((g) => g.childId === childId);
  const matchPlace = places.find((p) => haversineDistanceM(last.lat, last.lon, p.lat, p.lon) <= p.radiusM);
  const matchGeofence = geofences.find((g) => haversineDistanceM(last.lat, last.lon, g.lat, g.lon) <= g.radiusM);
  const zone = matchPlace?.nom ?? (matchGeofence ? matchGeofence.nom : null);
  if (user.role === 'secondaire') logAccess(childId, user.id, user.nom, 'État de zone');
  return { inZone: !!zone, zoneName: zone, asOf: last.timestamp };
}

export async function getHistory(
  token: string | null,
  childId: string,
  from?: string,
  to?: string
): Promise<Position[]> {
  await simulateLatency(300, 700);
  const user = resolveCurrentUser(token);
  const perms = assertChildAccess(childId, user);
  assertPermission(perms, 'historique');
  const hist = getDb().positions[childId] ?? [];
  const fromMs = from ? new Date(from).getTime() : -Infinity;
  const toMs = to ? new Date(to).getTime() : Infinity;
  if (user.role === 'secondaire') logAccess(childId, user.id, user.nom, 'Historique des trajets');
  return hist.filter((p) => {
    const t = new Date(p.timestamp).getTime();
    return t >= fromMs && t <= toMs;
  });
}
