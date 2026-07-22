import { useAuthStore } from '@/stores/authStore';
import { useMyPermissions } from '@/api/hooks/useSharing';
import { canPerform, type Action } from './permissions';

/** Décision unique "puis-je faire X sur cet enfant" pour l'UI — RBAC CDC1 §7.2. */
export function useCurrentAccess(childId: string | undefined) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'principal';
  const permissionsQuery = useMyPermissions(childId);
  const grantedPermissions = permissionsQuery.data ?? [];

  function can(action: Action): boolean {
    return canPerform(role, grantedPermissions, action);
  }

  return { role, grantedPermissions, can, isLoading: permissionsQuery.isLoading };
}
