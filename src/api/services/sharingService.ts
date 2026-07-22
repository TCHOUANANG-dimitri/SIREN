import { getDb, mutateDb, genId } from '../mock/db';
import { ApiError, simulateLatency } from '../network';
import { assertChildAccess, assertPrincipal, resolveCurrentUser } from '../mock/session';
import type { AccessAuditEntry, Permission, SecondaryAccess } from '@/models/entities';

export async function listShares(token: string | null, childId: string): Promise<SecondaryAccess[]> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  assertPrincipal(user);
  return getDb().secondaryAccess.filter((s) => s.childId === childId);
}

export async function createShare(
  token: string | null,
  childId: string,
  input: { userIdentifier: string; permissions: Permission[] }
): Promise<SecondaryAccess> {
  await simulateLatency(400, 800);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  assertPrincipal(user);
  const db = getDb();

  const existingUser = db.users.find(
    (u) => u.email.toLowerCase() === input.userIdentifier.toLowerCase() || u.telephone === input.userIdentifier
  );
  const alreadyInvited = existingUser
    ? db.secondaryAccess.some(
        (s) => s.childId === childId && s.userId === existingUser.id && s.status !== 'revoque'
      )
    : false;
  if (alreadyInvited) throw new ApiError('Cette personne est déjà invitée', 409);

  const secondaryUser =
    existingUser ??
    (() => {
      const created = {
        id: genId('user'),
        nom: input.userIdentifier,
        email: input.userIdentifier.includes('@') ? input.userIdentifier : `${genId('u')}@invite.local`,
        telephone: input.userIdentifier.includes('@') ? undefined : input.userIdentifier,
        role: 'secondaire' as const,
        langue: 'fr' as const,
        createdAt: new Date().toISOString(),
      };
      mutateDb((d) => d.users.push(created));
      return created;
    })();

  const share: SecondaryAccess = {
    id: genId('share'),
    childId,
    userId: secondaryUser.id,
    nom: secondaryUser.nom,
    permissions: input.permissions,
    invitedAt: new Date().toISOString(),
    status: 'invite',
  };
  mutateDb((d) => {
    d.secondaryAccess.push(share);
  });
  return share;
}

export async function getShare(token: string | null, shareId: string): Promise<SecondaryAccess> {
  await simulateLatency(150, 350);
  const user = resolveCurrentUser(token);
  const db = getDb();
  const share = db.secondaryAccess.find((s) => s.id === shareId);
  if (!share) throw new ApiError('Accès introuvable', 404);
  assertChildAccess(share.childId, user);
  assertPrincipal(user);
  return share;
}

export async function patchShare(
  token: string | null,
  shareId: string,
  patch: { permissions?: Permission[]; status?: SecondaryAccess['status'] }
): Promise<SecondaryAccess> {
  await simulateLatency(250, 550);
  const user = resolveCurrentUser(token);
  const db = getDb();
  const share = db.secondaryAccess.find((s) => s.id === shareId);
  if (!share) throw new ApiError('Accès introuvable', 404);
  assertChildAccess(share.childId, user);
  assertPrincipal(user);
  mutateDb((d) => {
    const target = d.secondaryAccess.find((s) => s.id === shareId);
    if (target) Object.assign(target, patch);
  });
  return { ...share, ...patch };
}

/**
 * Droits effectifs de l'utilisateur courant sur un enfant (principal = tous ; secondaire =
 * son propre octroi). Distinct de listShares (réservé au principal, liste TOUS les secondaires).
 */
export async function getMyPermissions(token: string | null, childId: string): Promise<Permission[]> {
  await simulateLatency(100, 250);
  const user = resolveCurrentUser(token);
  return assertChildAccess(childId, user);
}

export async function listAccessAudit(token: string | null, childId: string): Promise<AccessAuditEntry[]> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  assertPrincipal(user);
  return getDb()
    .accessAudit.filter((a) => a.childId === childId)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/** Journalise une consultation d'un secondaire — traçabilité CDC1 §9.24. */
export function logAccess(childId: string, secondaryUserId: string, secondaryNom: string, infoType: string) {
  mutateDb((d) => {
    d.accessAudit.unshift({
      id: genId('audit'),
      childId,
      secondaryUserId,
      secondaryNom,
      infoType,
      timestamp: new Date().toISOString(),
    });
  });
}
