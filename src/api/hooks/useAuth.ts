import { useMutation } from '@tanstack/react-query';
import i18n from '@/i18n';
import { api } from '..';
import { ApiError, toUserMessage } from '../errors';
import { useAuthStore } from '@/stores/authStore';
import { usePendingAuthStore } from '@/stores/pendingAuthStore';
import { signOut } from '@/features/auth/signOut';
import { acceptanceVersions } from '@/legal/registry';
import { trackEvent } from '@/utils/logger';
import { maskPhone, normalizePhoneInput } from '@/features/auth/phone';
import type { OtpChannel } from '../contracts';

const PHONE_CHANNELS: OtpChannel[] = ['sms', 'whatsapp'];

function reasonOf(error: unknown): string | undefined {
  return error instanceof ApiError ? (error.reason as string | undefined) : undefined;
}

function challengeError(): ApiError {
  return new ApiError(i18n.t('apiErrors.reasons.challenge_invalid'), 400, undefined, undefined, 'challenge_invalid');
}

/**
 * Inscription : téléphone obligatoire, e-mail facultatif. Le compte est créé,
 * mais la session n'est ouverte qu'après vérification du téléphone par code —
 * sauf si le serveur déclare l'étape non requise ou n'a AUCUN canal configuré
 * (la session s'ouvre alors avec un numéro « non vérifié », jamais prétendu vérifié).
 * Les versions des documents juridiques acceptés sont transmises au serveur.
 */
export function useRegister() {
  const start = usePendingAuthStore((s) => s.start);
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: async (input: { nom: string; telephone: string; email?: string; password: string }) => {
      const langue = i18n.language === 'en' ? 'en' : 'fr';
      const session = await api.auth.register({ ...input, langue, ...acceptanceVersions() });
      const available = await api.auth.otpChannels().catch(() => PHONE_CHANNELS);
      const channels = PHONE_CHANNELS.filter((c) => available.includes(c));
      const channel = channels[0] ?? 'sms';
      let otp;
      try {
        otp = await api.auth.requestOtp({ accessToken: session.accessToken, channel });
      } catch (error) {
        if (reasonOf(error) !== 'channel_unavailable') {
          // Le compte EXISTE déjà : on ne perd pas la session sur un échec d'envoi
          // (plafond, fournisseur). L'écran du code affiche l'erreur et permet le renvoi.
          start({ kind: 'register', session, challengeToken: null }, maskPhone(session.user.telephone),
            { channel, deliveryError: toUserMessage(error) }, channels);
          return { otpRequired: true as const };
        }
        otp = { required: false as const };
      }
      if (!otp.required) {
        await setSession(session);
        return { otpRequired: false as const };
      }
      start(
        { kind: 'register', session, challengeToken: otp.challengeToken ?? null },
        maskPhone(session.user.telephone),
        otp,
        channels
      );
      return { otpRequired: true as const };
    },
  });
}

/**
 * Connexion par téléphone ou e-mail. Si le serveur exige un second facteur, aucune
 * session n'est ouverte : le code part par le premier canal proposé, l'écran du code
 * permet d'en changer.
 */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const start = usePendingAuthStore((s) => s.start);
  return useMutation({
    mutationFn: async (input: { identifier: string; password: string }) => {
      const result = await api.auth.login({ identifier: input.identifier.trim(), password: input.password });
      if (result.twofaRequired) {
        const channel = result.channels[0];
        if (!channel) throw new ApiError(i18n.t('apiErrors.reasons.channel_unavailable'), 503, undefined, undefined, 'channel_unavailable');
        try {
          const challenge = await api.auth.sendSecondFactor({ mfaToken: result.mfaToken, channel });
          start({ kind: 'login', mfaToken: result.mfaToken, challengeToken: challenge.challengeToken as string }, '', challenge, result.channels);
        } catch (error) {
          // Premier canal en échec : l'écran du code permet d'en choisir un autre.
          start({ kind: 'login', mfaToken: result.mfaToken, challengeToken: '' }, '',
            { channel, deliveryError: toUserMessage(error) }, result.channels);
        }
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
      if (!pending || pending.kind === 'reset') throw challengeError();
      if (pending.kind === 'register') {
        await api.auth.verifyOtp({ code, accessToken: pending.session.accessToken, challengeToken: pending.challengeToken });
        return { ...pending.session, user: { ...pending.session.user, phoneVerified: true } };
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

/** Nouveau code, éventuellement par un autre canal ; le précédent devient invalide. */
export function useResendOtp() {
  return useMutation({
    mutationFn: async (requested?: OtpChannel) => {
      const { pending, renew, channel: current } = usePendingAuthStore.getState();
      if (!pending) throw challengeError();
      const channel = requested ?? current ?? 'sms';
      if (pending.kind === 'register') {
        const otp = await api.auth.requestOtp({ accessToken: pending.session.accessToken, channel });
        renew(otp.challengeToken ?? null, { ...otp, channel: otp.channel ?? channel });
      } else if (pending.kind === 'login') {
        const challenge = await api.auth.sendSecondFactor({ mfaToken: pending.mfaToken, channel });
        renew(challenge.challengeToken, challenge);
      } else {
        const challenge = await api.auth.forgotPassword({ identifier: pending.identifier, channel });
        renew(challenge.challengeToken, { ...challenge, channel });
      }
    },
  });
}

/** Mot de passe oublié, étape 1 : un code est envoyé si un compte existe (réponse identique sinon). */
export function useForgotPassword() {
  const start = usePendingAuthStore((s) => s.start);
  return useMutation({
    mutationFn: async (input: { identifier: string; channel: OtpChannel }) => {
      const identifier = input.identifier.trim();
      const challenge = await api.auth.forgotPassword({ identifier, channel: input.channel });
      start(
        { kind: 'reset', identifier, challengeToken: challenge.challengeToken as string },
        '',
        { ...challenge, channel: input.channel },
        ['sms', 'whatsapp', 'email']
      );
    },
  });
}

/** Mot de passe oublié, étape 2 : code + nouveau mot de passe. Aucune session n'est ouverte : l'utilisateur se reconnecte. */
export function useResetPassword() {
  const clearPending = usePendingAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: async (input: { code: string; newPassword: string }) => {
      const pending = usePendingAuthStore.getState().pending;
      if (!pending || pending.kind !== 'reset') throw challengeError();
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

/** Changement (ou ajout) du numéro, étape 1 : mot de passe + code envoyé au nouveau numéro. */
export function useRequestPhoneChange() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPhone: string; channel: 'sms' | 'whatsapp' }) =>
      api.users.requestPhoneChange({ ...input, newPhone: normalizePhoneInput(input.newPhone) }),
  });
}

/** Étape 2 : le numéro n'est remplacé qu'une fois le code validé par le serveur. */
export function useConfirmPhoneChange() {
  const updateUser = useAuthStore((s) => s.updateUser);
  return useMutation({
    mutationFn: (input: { challengeToken: string; code: string }) => api.users.confirmPhoneChange(input),
    onSuccess: (user) => updateUser(user),
  });
}

export function useLogout() {
  return useMutation({ mutationFn: () => signOut({ revokeOnServer: true }) });
}
