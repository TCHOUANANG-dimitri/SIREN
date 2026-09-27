import i18n from '@/i18n';
import { getDb } from '../db';
import { ApiError } from '../../errors';
import { simulateLatency } from '../helpers';
import { assertChildAccess, assertPrincipal, resolveCurrentUser } from '../session';
import { triggerScenarioDisappearance } from '../scenarioEngine';
import type { SearchZone } from '@/models/entities';

export async function getSearchZone(token: string | null, childId: string): Promise<SearchZone> {
  await simulateLatency(400, 900);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  const zone = getDb().searchZones[childId];
  if (!zone) throw new ApiError(i18n.t('errors.searchZoneNotReady'), 404);
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
