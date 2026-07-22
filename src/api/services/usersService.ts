import { mutateDb } from '../mock/db';
import { simulateLatency } from '../network';
import { resolveCurrentUser } from '../mock/session';
import type { User } from '@/models/entities';

export async function patchMe(token: string | null, patch: Partial<User>): Promise<User> {
  await simulateLatency(300, 600);
  const user = resolveCurrentUser(token);
  mutateDb((d) => {
    const target = d.users.find((u) => u.id === user.id);
    if (target) Object.assign(target, patch);
  });
  return { ...user, ...patch };
}

export async function deleteMyAccount(token: string | null): Promise<{ deleted: true }> {
  await simulateLatency(400, 800);
  const user = resolveCurrentUser(token);
  mutateDb((d) => {
    const childIds = d.children.filter((c) => c.parentId === user.id).map((c) => c.id);
    d.children = d.children.filter((c) => c.parentId !== user.id);
    d.alerts = d.alerts.filter((a) => !childIds.includes(a.childId));
    d.places = d.places.filter((p) => !childIds.includes(p.childId));
    d.geofences = d.geofences.filter((g) => !childIds.includes(g.childId));
    d.secondaryAccess = d.secondaryAccess.filter((s) => !childIds.includes(s.childId));
    d.users = d.users.filter((u) => u.id !== user.id);
    delete d.passwordsByEmail[user.email.toLowerCase()];
    for (const id of childIds) {
      delete d.positions[id];
      delete d.riskScores[id];
      delete d.riskHistory[id];
      delete d.searchZones[id];
    }
  });
  return { deleted: true };
}
