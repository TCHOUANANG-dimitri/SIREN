import { getDb } from '../mock/db';
import { ApiError, simulateLatency } from '../network';
import { assertChildAccess, assertPrincipal, resolveCurrentUser } from '../mock/session';
import { triggerScenarioDisappearance } from '../mock/scenarioEngine';
import type { SearchZone } from '@/models/entities';

export async function getSearchZone(token: string | null, childId: string): Promise<SearchZone> {
  await simulateLatency(400, 900);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  const zone = getDb().searchZones[childId];
  if (!zone) throw new ApiError('Zone de recherche pas encore calculée', 404);
  return zone;
}

export async function postDisappearance(token: string | null, childId: string): Promise<{ accepted: true }> {
  await simulateLatency(200, 400);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  assertPrincipal(user); // "Déclencher mobilisation disparition" réservé au principal — CDC §7.2
  triggerScenarioDisappearance(childId);
  return { accepted: true };
}
