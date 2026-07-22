import { create } from 'zustand';
import { secureStorage, SECURE_KEYS } from '@/utils/secureStorage';
import type { User } from '@/models/entities';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  isBiometricLocked: boolean;
  setSession: (params: { user: User; accessToken: string; refreshToken: string }) => Promise<void>;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
  setBiometricLocked: (locked: boolean) => void;
  updateUser: (patch: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isHydrated: false,
  isBiometricLocked: false,

  async setSession({ user, accessToken, refreshToken }) {
    await secureStorage.setItem(SECURE_KEYS.accessToken, accessToken);
    await secureStorage.setItem(SECURE_KEYS.refreshToken, refreshToken);
    set({ user, accessToken, refreshToken });
  },

  async hydrate() {
    const [accessToken, refreshToken] = await Promise.all([
      secureStorage.getItem(SECURE_KEYS.accessToken),
      secureStorage.getItem(SECURE_KEYS.refreshToken),
    ]);
    set({ accessToken, refreshToken, isHydrated: true });
  },

  async logout() {
    await Promise.all([
      secureStorage.removeItem(SECURE_KEYS.accessToken),
      secureStorage.removeItem(SECURE_KEYS.refreshToken),
    ]);
    set({ user: null, accessToken: null, refreshToken: null });
  },

  setBiometricLocked(locked) {
    set({ isBiometricLocked: locked });
  },

  updateUser(patch) {
    const current = get().user;
    if (current) set({ user: { ...current, ...patch } });
  },
}));
