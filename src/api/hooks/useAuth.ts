import { useMutation } from '@tanstack/react-query';
import { api } from '..';
import { useAuthStore } from '@/stores/authStore';
import { usePendingAuthStore } from '@/stores/pendingAuthStore';
import { signOut } from '@/features/auth/signOut';
import { trackEvent } from '@/utils/logger';

/**
 * Inscription : le compte est créé, mais la session n'est ouverte qu'après
 * validation de l'OTP (CDC App §4.1). Les jetons restent en mémoire d'ici là.
 */
export function useRegister() {
  const setPending = usePendingAuthStore((s) => s.setPending);
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: async (input: { nom: string; email: string; telephone?: string; password: string }) => {
      const session = await api.auth.register(input);
      const destination = input.telephone || input.email;
      const otp = await api.auth.requestOtp({ destination });
      if (!otp.required) {
        await setSession(session);
        return { otpRequired: false as const };
      }
      setPending(session, destination, otp.devHint, 'register');
      return { otpRequired: true as const };
    },
  });
}

/** Connexion ; si le serveur exige un second facteur, on passe par l'écran OTP. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const setPending = usePendingAuthStore((s) => s.setPending);
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const result = await api.auth.login(input);
      const session = { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken };
      if (result.twofaRequired) {
        const otp = await api.auth.requestOtp({ destination: result.user.telephone || result.user.email });
        if (otp.required) {
          setPending(session, result.user.telephone || result.user.email, otp.devHint, 'login');
          return { twofaRequired: true as const };
        }
      }
      await setSession(session);
      trackEvent('login_success');
      return { twofaRequired: false as const };
    },
  });
}

export function useVerifyOtp() {
  const setSession = useAuthStore((s) => s.setSession);
  const clearPending = usePendingAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: async (code: string) => {
      const pending = usePendingAuthStore.getState().pending;
      if (!pending) throw new Error('Aucune vérification en attente');
      await api.auth.verifyOtp({ code, accessToken: pending.accessToken });
      return pending;
    },
    onSuccess: async (session) => {
      await setSession(session);
      clearPending();
      trackEvent('login_success');
    },
  });
}

export function useResendOtp() {
  return useMutation({
    mutationFn: async () => {
      const { destination } = usePendingAuthStore.getState();
      const otp = await api.auth.requestOtp({ destination });
      usePendingAuthStore.getState().setDevHint(otp.devHint ?? null);
    },
  });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => api.auth.forgotPassword(email) });
}

export function useLogout() {
  return useMutation({ mutationFn: () => signOut({ revokeOnServer: true }) });
}
