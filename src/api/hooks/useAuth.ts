import { useMutation } from '@tanstack/react-query';
import i18n from '@/i18n';
import { api } from '..';
import { ApiError } from '../errors';
import { useAuthStore } from '@/stores/authStore';
import { usePendingAuthStore } from '@/stores/pendingAuthStore';
import { signOut } from '@/features/auth/signOut';
import { acceptanceVersions } from '@/legal/registry';
import { trackEvent } from '@/utils/logger';

/**
 * Inscription : le compte est créé, mais la session n'est ouverte qu'après
 * confirmation de l'email par code (CDC App §4.1) — sauf si le serveur déclare
 * l'étape non requise. Les jetons restent en mémoire d'ici là.
 * Les versions des documents juridiques acceptés sont transmises au serveur.
 */
export function useRegister() {
  const start = usePendingAuthStore((s) => s.start);
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: async (input: { nom: string; email: string; telephone?: string; password: string }) => {
      const langue = i18n.language === 'en' ? 'en' : 'fr';
      const session = await api.auth.register({ ...input, langue, ...acceptanceVersions() });
      const otp = await api.auth.requestOtp({ accessToken: session.accessToken });
      if (!otp.required) {
        await setSession(session);
        return { otpRequired: false as const };
      }
      start({ kind: 'register', session, challengeToken: otp.challengeToken ?? null }, session.user.email, otp);
      return { otpRequired: true as const };
    },
  });
}

/** Connexion ; si le serveur exige un second facteur, aucune session n'est ouverte avant le code. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const start = usePendingAuthStore((s) => s.start);
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const result = await api.auth.login(input);
      if (result.twofaRequired) {
        start({ kind: 'login', challengeToken: result.challengeToken as string }, input.email.trim().toLowerCase(), result);
        return { twofaRequired: true as const };
      }
      await setSession({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken });
      trackEvent('login_success');
      return { twofaRequired: false as const };
    },
  });
}

/** Validation du code pour une inscription ou une connexion (le mot de passe oublié a son propre hook). */
export function useVerifyOtp() {
  const setSession = useAuthStore((s) => s.setSession);
  const clearPending = usePendingAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: async (code: string) => {
      const pending = usePendingAuthStore.getState().pending;
      if (!pending || pending.kind === 'reset') throw new ApiError(i18n.t('apiErrors.reasons.challenge_invalid'), 400, undefined, undefined, 'challenge_invalid');
      if (pending.kind === 'register') {
        await api.auth.verifyOtp({ code, accessToken: pending.session.accessToken, challengeToken: pending.challengeToken });
        return pending.session;
      }
      return api.auth.verifySecondFactor({ challengeToken: pending.challengeToken, code });
    },
    onSuccess: async (session) => {
      await setSession(session);
      clearPending();
      trackEvent('login_success');
    },
  });
}

/** Nouveau code : le serveur applique un délai minimal entre deux envois. */
export function useResendOtp() {
  return useMutation({
    mutationFn: async () => {
      const { pending, renew } = usePendingAuthStore.getState();
      if (!pending) throw new ApiError(i18n.t('apiErrors.reasons.challenge_invalid'), 400, undefined, undefined, 'challenge_invalid');
      if (pending.kind === 'register') {
        const otp = await api.auth.requestOtp({ accessToken: pending.session.accessToken });
        renew(otp.challengeToken ?? null, otp);
      } else if (pending.kind === 'login') {
        const challenge = await api.auth.resendSecondFactor(pending.challengeToken);
        renew(challenge.challengeToken, challenge);
      } else {
        const email = usePendingAuthStore.getState().destination;
        const challenge = await api.auth.forgotPassword(email);
        renew(challenge.challengeToken, challenge);
      }
    },
  });
}

/** Mot de passe oublié, étape 1 : un code est envoyé si un compte existe (réponse identique sinon). */
export function useForgotPassword() {
  const start = usePendingAuthStore((s) => s.start);
  return useMutation({
    mutationFn: async (email: string) => {
      const normalized = email.trim().toLowerCase();
      const challenge = await api.auth.forgotPassword(normalized);
      start({ kind: 'reset', challengeToken: challenge.challengeToken as string }, normalized, challenge);
    },
  });
}

/** Mot de passe oublié, étape 2 : code + nouveau mot de passe. Aucune session n'est ouverte : l'utilisateur se reconnecte. */
export function useResetPassword() {
  const clearPending = usePendingAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: async (input: { code: string; newPassword: string }) => {
      const pending = usePendingAuthStore.getState().pending;
      if (!pending || pending.kind !== 'reset') throw new ApiError(i18n.t('apiErrors.reasons.challenge_invalid'), 400, undefined, undefined, 'challenge_invalid');
      await api.auth.resetPassword({ challengeToken: pending.challengeToken, ...input });
    },
    onSuccess: () => clearPending(),
  });
}

/** Changement de mot de passe connecté : les autres sessions sont révoquées, celle-ci reçoit de nouveaux jetons. */
export function useChangePassword() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string }) => {
      const tokens = await api.users.changePassword(input);
      await setTokens(tokens);
    },
  });
}

export function useSetTwoFactor() {
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: (input: { enabled: boolean; password: string }) => api.users.setTwoFactor(input),
    onSuccess: (user) => updateUser(user),
  });
}

export function useLogout() {
  return useMutation({ mutationFn: () => signOut({ revokeOnServer: true }) });
}
