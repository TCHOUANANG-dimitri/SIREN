import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { api } from '..';
import type { User } from '@/models/entities';
import { signOut } from '@/features/auth/signOut';

export function usePatchMe() {
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: (patch: Partial<Pick<User, 'nom' | 'telephone' | 'langue'>>) => api.users.patchMe(patch),
    onSuccess: (user) => updateUser(user),
  });
}

/** Suppression du compte : effacement serveur puis purge locale complète (CDC App §4.6, §8). */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => api.users.deleteMe(),
    onSuccess: () => signOut({ revokeOnServer: false }),
  });
}
