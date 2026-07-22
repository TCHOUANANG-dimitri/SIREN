import { create } from 'zustand';
import type { User } from '@/models/entities';

interface PendingAuth {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface PendingAuthState {
  pending: PendingAuth | null;
  destination: string;
  devHint: string | null;
  setPending: (pending: PendingAuth, destination: string, devHint?: string) => void;
  clear: () => void;
}

/** Fait transiter les infos entre Inscription/Connexion et l'écran OTP — non persisté. */
export const usePendingAuthStore = create<PendingAuthState>((set) => ({
  pending: null,
  destination: '',
  devHint: null,
  setPending: (pending, destination, devHint) => set({ pending, destination, devHint: devHint ?? null }),
  clear: () => set({ pending: null, destination: '', devHint: null }),
}));
