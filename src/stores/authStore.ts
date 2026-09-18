import { create } from 'zustand';
import { secureStorage, SECURE_KEYS } from '@/utils/secureStorage';
import { storage } from '@/utils/storage';
import type { User } from '@/models/entities';

/**
 * Le profil est persisté à part des jetons : ce n'est pas un secret, et
 * SecureStore plafonne la taille des valeurs sur Android. Sans cette
 * persistance, `user` repartait à null à chaque démarrage — les champs de
 * profil des réglages s'affichaient alors vides malgré une inscription faite.
 */
const USER_KEY = 'siren.user';

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
    await Promise.all([
      secureStorage.setItem(SECURE_KEYS.accessToken, accessToken),
      secureStorage.setItem(SECURE_KEYS.refreshToken, refreshToken),
      storage.setItem(USER_KEY, user),
    ]);
    set({ user, accessToken, refreshToken });
  },

  async hydrate() {
    const [accessToken, refreshToken, user] = await Promise.all([
      secureStorage.getItem(SECURE_KEYS.accessToken),
      secureStorage.getItem(SECURE_KEYS.refreshToken),
      storage.getItem<User>(USER_KEY),
    ]);
    set({ user, accessToken, refreshToken, isHydrated: true });
  },

  async logout() {
    await Promise.all([
      secureStorage.removeItem(SECURE_KEYS.accessToken),
      secureStorage.removeItem(SECURE_KEYS.refreshToken),
      storage.removeItem(USER_KEY),
    ]);
    set({ user: null, accessToken: null, refreshToken: null });
  },

  setBiometricLocked(locked) {
    set({ isBiometricLocked: locked });
  },

  updateUser(patch) {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...patch };
    set({ user: next });
    // Persistance en arrière-plan : la mise à jour de l'UI ne doit pas attendre
    // l'écriture disque, mais le profil doit survivre au redémarrage.
    void storage.setItem(USER_KEY, next);
  },
}));
