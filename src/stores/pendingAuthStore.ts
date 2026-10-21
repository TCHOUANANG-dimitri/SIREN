import { create } from 'zustand';
import type { AuthSession } from '@/models/entities';
import type { OtpChannel } from '@/api/contracts';

/**
 * Vérification par code en cours, entre un écran d'entrée (inscription,
 * connexion, mot de passe oublié) et l'écran de saisie du code. Jamais persisté :
 * fermer l'app annule la vérification.
 *
 * - register : compte créé, session gardée en mémoire jusqu'à la vérification du téléphone ;
 * - login    : second facteur — aucune session n'existe encore ; le jeton MFA ne sert
 *              qu'à (r)envoyer le code par le canal choisi ;
 * - reset    : mot de passe oublié — le code et le nouveau mot de passe sont envoyés ensemble.
 */
export type PendingVerification =
  | { kind: 'register'; session: AuthSession; challengeToken: string | null }
  | { kind: 'login'; mfaToken: string; challengeToken: string }
  | { kind: 'reset'; identifier: string; challengeToken: string };

interface ChallengeInfo {
  devHint?: string;
  expiresIn?: number | null;
  channel?: OtpChannel | null;
  /** Envoi du premier code en échec : message affiché sur l'écran du code (renvoi possible). */
  deliveryError?: string | null;
}

interface PendingAuthState {
  pending: PendingVerification | null;
  /** Destination affichée (« code envoyé à … »), masquée si besoin. */
  destination: string;
  /** Canal du dernier code envoyé. */
  channel: OtpChannel | null;
  /** Canaux proposables pour un renvoi (jamais un canal non configuré). */
  channels: OtpChannel[];
  /** Code affiché en démo / développement uniquement ; toujours null en production. */
  devHint: string | null;
  /** Expiration annoncée par le serveur (ms epoch), null si inconnue. */
  expiresAt: number | null;
  /** Premier envoi en échec (message déjà traduit), null sinon. */
  deliveryError: string | null;
  start: (pending: PendingVerification, destination: string, challenge: ChallengeInfo, channels: OtpChannel[]) => void;
  renew: (challengeToken: string | null, challenge: ChallengeInfo) => void;
  clear: () => void;
}

function expiry(expiresIn: number | null | undefined): number | null {
  return expiresIn ? Date.now() + expiresIn * 1000 : null;
}

export const usePendingAuthStore = create<PendingAuthState>((set, get) => ({
  pending: null,
  destination: '',
  channel: null,
  channels: [],
  devHint: null,
  expiresAt: null,
  deliveryError: null,
  start: (pending, destination, challenge, channels) =>
    set({
      pending,
      destination,
      channel: challenge.channel ?? null,
      channels,
      devHint: challenge.devHint ?? null,
      expiresAt: expiry(challenge.expiresIn),
      deliveryError: challenge.deliveryError ?? null,
    }),
  renew: (challengeToken, challenge) => {
    const current = get().pending;
    if (!current) return;
    const pending =
      current.kind === 'register'
        ? { ...current, challengeToken }
        : challengeToken
          ? { ...current, challengeToken }
          : current;
    set({
      pending,
      channel: challenge.channel ?? get().channel,
      devHint: challenge.devHint ?? null,
      expiresAt: expiry(challenge.expiresIn),
      deliveryError: null,
    });
  },
  clear: () => set({ pending: null, destination: '', channel: null, channels: [], devHint: null, expiresAt: null, deliveryError: null }),
}));
