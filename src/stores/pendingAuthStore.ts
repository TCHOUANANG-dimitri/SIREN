import { create } from 'zustand';
import type { AuthSession } from '@/models/entities';

interface PendingAuthState {
  pending: AuthSession | null;
  /** Origine de la vérification : fin d'inscription ou second facteur de connexion. */
  reason: 'register' | 'login' | null;
  destination: string;
  /** Code affiché en démo (mock) uniquement ; toujours null en live. */
  devHint: string | null;
  setPending: (pending: AuthSession, destination: string, devHint: string | undefined, reason: 'register' | 'login') => void;
  setDevHint: (devHint: string | null) => void;
  clear: () => void;
}

/** Fait transiter la session entre Inscription/Connexion et l'écran OTP — jamais persisté. */
export const usePendingAuthStore = create<PendingAuthState>((set) => ({
  pending: null,
  reason: null,
  destination: '',
  devHint: null,
  setPending: (pending, destination, devHint, reason) => set({ pending, destination, devHint: devHint ?? null, reason }),
  setDevHint: (devHint) => set({ devHint }),
  clear: () => set({ pending: null, destination: '', devHint: null, reason: null }),
}));
