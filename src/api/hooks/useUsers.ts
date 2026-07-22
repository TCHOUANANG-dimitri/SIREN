import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import * as usersService from '../services/usersService';
import type { User } from '@/models/entities';

export function usePatchMe() {
  const token = useAuthStore((s) => s.accessToken);
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: (patch: Partial<User>) => usersService.patchMe(token, patch),
    onSuccess: (user) => updateUser(user),
  });
}

export function useDeleteAccount() {
  const token = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  return useMutation({
    mutationFn: () => usersService.deleteMyAccount(token),
    onSuccess: () => logout(),
  });
}
