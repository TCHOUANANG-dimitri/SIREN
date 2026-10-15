import { create } from 'zustand';
import type { AuthSession } from '@/models/entities';

/**
 * Vérification par code en cours, entre un écran d'entrée (inscription,
 * connexion, mot de passe oublié) et l'écran de saisie du code. Jamais persisté :
 * fermer l'app annule la vérification.
 *
 * - register : compte créé, session gardée en mémoire jusqu'à la confirmation de l'email ;
 * - login    : second facteur — aucune session n'existe encore ;
 * - reset    : mot de passe oublié — le code et le nouveau mot de passe sont envoyés ensemble.
 */
export type PendingVerification =
  | { kind: 'register'; session: AuthSession; challengeToken: string | null }
  | { kind: 'login'; challengeToken: string }
  | { kind: 'reset'; challengeToken: string };

interface PendingAuthState {
  pending: PendingVerification | null;
  /** Adresse affichée (« code envoyé à … »). */
  destination: string;
  /** Code affiché en démo / développement uniquement ; toujours null en production. */
  devHint: string | null;
  /** Expiration annoncée par le serveur (ms epoch), null si inconnue. */
  expiresAt: number | null;
  start: (pending: PendingVerification, destination: string, challenge: { devHint?: string; expiresIn?: number | null }) => void;
  renew: (challengeToken: string | null, challenge: { devHint?: string; expiresIn?: number | null }) => void;
  clear: () => void;
}

function expiry(expiresIn: number | null | undefined): number | null {
  return expiresIn ? Date.now() + expiresIn * 1000 : null;
}

export const usePendingAuthStore = create<PendingAuthState>((set, get) => ({
  pending: null,
  destination: '',
  devHint: null,
  expiresAt: null,
  start: (pending, destination, challenge) =>
    set({ pending, destination, devHint: challenge.devHint ?? null, expiresAt: expiry(challenge.expiresIn) }),
  renew: (challengeToken, challenge) => {
    const current = get().pending;
    if (!current) return;
    const pending =
      current.kind === 'register'
        ? { ...current, challengeToken }
        : challengeToken
          ? { ...current, challengeToken }
          : current;
    set({ pending, devHint: challenge.devHint ?? null, expiresAt: expiry(challenge.expiresIn) });
  },
  clear: () => set({ pending: null, destination: '', devHint: null, expiresAt: null }),
}));
