import { getDb, mutateDb, genId } from '../mock/db';
import { ApiError, simulateLatency } from '../network';
import { assertChildAccess, resolveCurrentUser } from '../mock/session';
import type { Place } from '@/models/entities';

export async function listPlaces(token: string | null, childId: string): Promise<Place[]> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  return getDb().places.filter((p) => p.childId === childId);
}

export async function createPlace(
  token: string | null,
  childId: string,
  input: Omit<Place, 'id' | 'childId' | 'source'>
): Promise<Place> {
  await simulateLatency(300, 600);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  const place: Place = { id: genId('place'), childId, source: 'declare', ...input };
  mutateDb((d) => {
    d.places.push(place);
  });
  return place;
}

export async function patchPlace(
  token: string | null,
  placeId: string,
  patch: Partial<Pick<Place, 'nom' | 'radiusM' | 'isNew'>>
): Promise<Place> {
  await simulateLatency(200, 500);
  const user = resolveCurrentUser(token);
  const db = getDb();
  const place = db.places.find((p) => p.id === placeId);
  if (!place) throw new ApiError('Lieu introuvable', 404);
  assertChildAccess(place.childId, user);
  mutateDb((d) => {
    const target = d.places.find((p) => p.id === placeId);
    if (target) Object.assign(target, patch);
  });
  return { ...place, ...patch };
}
