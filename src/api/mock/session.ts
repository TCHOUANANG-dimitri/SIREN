import { getDb } from './db';
import { ApiError, userIdFromToken } from '../network';
import type { Permission, User } from '@/models/entities';

export function resolveCurrentUser(token: string | null | undefined): User {
  const userId = userIdFromToken(token);
  if (!userId) throw new ApiError('Non authentifié', 401);
  const user = getDb().users.find((u) => u.id === userId);
  if (!user) throw new ApiError('Utilisateur introuvable', 401);
  return user;
}

const ALL_SECONDARY_PERMISSIONS: Permission[] = [
  'position_precise',
  'etat_zone',
  'alertes_prealerte',
  'alertes_urgence',
  'historique',
  'mobilisation',
];

export function getSecondaryPermissions(childId: string, userId: string): Permission[] {
  const share = getDb().secondaryAccess.find(
    (s) => s.childId === childId && s.userId === userId && s.status === 'actif'
  );
  return share?.permissions ?? [];
}

/** Vérifie l'accès à un enfant et renvoie les permissions effectives — jamais de confiance au client (CDC2 §7). */
export function assertChildAccess(childId: string, user: User): Permission[] {
  const child = getDb().children.find((c) => c.id === childId);
  if (!child) throw new ApiError('Enfant introuvable', 404);
  if (user.role === 'principal') {
    if (child.parentId !== user.id) throw new ApiError('Accès refusé', 403);
    return ALL_SECONDARY_PERMISSIONS;
  }
  const perms = getSecondaryPermissions(childId, user.id);
  if (perms.length === 0) throw new ApiError('Accès refusé', 403);
  return perms;
}

export function assertPrincipal(user: User) {
  if (user.role !== 'principal') throw new ApiError('Action réservée au parent principal', 403);
}

export function assertPermission(perms: Permission[], required: Permission) {
  if (!perms.includes(required)) throw new ApiError('Droit non accordé', 403);
}
