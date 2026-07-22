import { useMutation } from '@tanstack/react-query';
import * as authService from '../services/authService';
import { useAuthStore } from '@/stores/authStore';
import { usePendingAuthStore } from '@/stores/pendingAuthStore';

export function useRegister() {
  const setPending = usePendingAuthStore((s) => s.setPending);
  return useMutation({
    mutationFn: authService.register,
    onSuccess: async (result, variables) => {
      const otp = await authService.requestOtp();
      setPending(result, variables.telephone || variables.email, otp.devHint);
    },
  });
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: authService.login,
    onSuccess: (result) => setSession(result),
  });
}

export function useVerifyOtp() {
  const setSession = useAuthStore((s) => s.setSession);
  const clearPending = usePendingAuthStore((s) => s.clear);
  const pending = usePendingAuthStore((s) => s.pending);
  return useMutation({
    mutationFn: (code: string) => {
      if (!pending) throw new Error('Aucune inscription en attente');
      return authService.verifyOtp(code, pending);
    },
    onSuccess: async (result) => {
      await setSession(result);
      clearPending();
    },
  });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: authService.forgotPassword });
}
