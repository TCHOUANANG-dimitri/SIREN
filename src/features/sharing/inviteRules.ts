import { SHARING_RULES } from '@/config/business';
import type { SecondaryAccess, User } from '@/models/entities';

/**
 * Règles d'invitation d'un utilisateur secondaire, vérifiées AVANT l'appel
 * serveur pour répondre immédiatement. Le serveur applique les mêmes règles
 * (server/app/api/v1/endpoints/sharing.py) : le client n'est jamais la seule
 * barrière.
 */
export type InviteIdentifierKind = 'email' | 'phone';

export type InviteCheck =
  | { ok: true; identifier: string; kind: InviteIdentifierKind }
  | { ok: false; reason: 'empty' | 'identifier_invalid' | 'self_invite' | 'secondary_limit' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d{8,15}$/;

/** Email en minuscules ; téléphone sans espaces, points, tirets ni parenthèses. */
export function normalizeIdentifier(raw: string): { identifier: string; kind: InviteIdentifierKind | null } {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    return { identifier: email, kind: EMAIL_RE.test(email) ? 'email' : null };
  }
  const phone = trimmed.replace(/[\s.\-()]/g, '');
  return { identifier: phone, kind: PHONE_RE.test(phone) ? 'phone' : null };
}

/**
 * Deux numéros désignent la même ligne si leurs chiffres sont égaux, ou si l'un
 * est l'autre précédé d'un indicatif pays (+237 6XX… et 6XX…).
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = a.replace(/\D/g, '');
  const db = b.replace(/\D/g, '');
  if (da.length < 8 || db.length < 8) return false;
  if (da === db) return true;
  const [short, long] = da.length < db.length ? [da, db] : [db, da];
  return long.endsWith(short) && long.length - short.length <= 3;
}

export function isSelf(identifier: string, kind: InviteIdentifierKind, user: Pick<User, 'email' | 'telephone'> | null): boolean {
  if (!user) return false;
  if (kind === 'email') return !!user.email && identifier === user.email.trim().toLowerCase();
  return samePhone(identifier, user.telephone);
}

/** Partages qui occupent une place : invités et actifs (les révoqués libèrent la place). */
export function activeShareCount(shares: SecondaryAccess[] | undefined): number {
  return (shares ?? []).filter((s) => s.status !== 'revoque').length;
}

export function checkInvite(input: {
  raw: string;
  user: Pick<User, 'email' | 'telephone'> | null;
  shares: SecondaryAccess[] | undefined;
}): InviteCheck {
  if (input.raw.trim().length === 0) return { ok: false, reason: 'empty' };
  const { identifier, kind } = normalizeIdentifier(input.raw);
  if (!kind) return { ok: false, reason: 'identifier_invalid' };
  if (isSelf(identifier, kind, input.user)) return { ok: false, reason: 'self_invite' };
  if (activeShareCount(input.shares) >= SHARING_RULES.maxSecondariesPerChild) return { ok: false, reason: 'secondary_limit' };
  return { ok: true, identifier, kind };
}
