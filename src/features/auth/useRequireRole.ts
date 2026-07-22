import { useAuthStore } from '@/stores/authStore';
import type { Role } from '@/models/entities';

/** true si l'utilisateur courant a le rôle requis — pour masquer/rediriger un écran principal-only. */
export function useRequireRole(role: Role): boolean {
  const user = useAuthStore((s) => s.user);
  return user?.role === role;
}
