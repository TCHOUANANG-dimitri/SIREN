import i18n from '@/i18n';
import { getDb, mutateDb, genId } from '../db';
import { ApiError, reasonError } from '../../errors';
import { isSelf, normalizeIdentifier, samePhone } from '@/features/sharing/inviteRules';
import { simulateLatency } from '../helpers';
import { assertChildAccess, assertPrincipal, resolveCurrentUser } from '../session';
import { SHARING_RULES } from '@/config/business';
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

  // Mêmes règles que le serveur (sharing.py) : identifiant valide, pas soi-même,
  // personne déjà inscrite, pas de doublon, plafond de 3.
  const { identifier, kind } = normalizeIdentifier(input.userIdentifier);
  if (!kind) throw reasonError('identifier_invalid', 422);
  if (isSelf(identifier, kind, user)) throw reasonError('self_invite', 422);
  const secondaryUser = db.users.find((u) =>
    kind === 'email' ? u.email.toLowerCase() === identifier : samePhone(u.telephone, identifier)
  );
  if (!secondaryUser || secondaryUser.id === user.id) throw reasonError('invitee_not_found', 404);
  const alreadyInvited = db.secondaryAccess.some(
    (s) => s.childId === childId && s.userId === secondaryUser.id && s.status !== 'revoque'
  );
  if (alreadyInvited) throw reasonError('already_shared', 409);

  const activeShares = db.secondaryAccess.filter((s) => s.childId === childId && s.status !== 'revoque').length;
  if (activeShares >= SHARING_RULES.maxSecondariesPerChild) {
    throw reasonError('secondary_limit', 409, { max: SHARING_RULES.maxSecondariesPerChild });
  }

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
  if (!share) throw new ApiError(i18n.t('errors.shareNotFound'), 404);
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
  if (!share) throw new ApiError(i18n.t('errors.shareNotFound'), 404);
  assertChildAccess(share.childId, user);
  assertPrincipal(user);
  if (patch.status && patch.status !== 'revoque' && share.status === 'revoque') {
    const activeShares = db.secondaryAccess.filter((s) => s.childId === share.childId && s.status !== 'revoque').length;
    if (activeShares >= SHARING_RULES.maxSecondariesPerChild) {
      throw reasonError('secondary_limit', 409, { max: SHARING_RULES.maxSecondariesPerChild });
    }
  }
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
