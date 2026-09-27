import { queryClient } from '@/api/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { usePendingAuthStore } from '@/stores/pendingAuthStore';
import { useUiStore } from '@/stores/uiStore';
import { storage } from '@/utils/storage';
import { logger } from '@/utils/logger';
import { clearPersistedQueryCache } from '@/api/persistence';

/** Préférences locales liées au compte — purgées à la déconnexion (CDC App §8 Confidentialité). */
export const ACCOUNT_SCOPED_KEYS = [
  'siren.prefs.notifications',
  'siren.prefs.biometricLock',
  'siren.prefs.communityProximity',
  'siren.pushToken',
];

/**
 * Déconnexion complète : révocation serveur (best effort), purge du cache de
 * requêtes (mémoire + disque), des préférences liées au compte et des jetons.
 */
export async function signOut(options: { revokeOnServer?: boolean } = {}) {
  const { refreshToken } = useAuthStore.getState();
  if (options.revokeOnServer !== false && refreshToken) {
    try {
      // Import tardif : évite un cycle api → session → signOut → api au chargement.
      const { api } = await import('@/api');
      await api.auth.logout(refreshToken);
    } catch (error) {
      logger.warn('Révocation serveur impossible, purge locale effectuée quand même', { error: String(error) });
    }
  }
  queryClient.clear();
  usePendingAuthStore.getState().clear();
  useUiStore.getState().setSelectedChildId(null);
  await Promise.allSettled([clearPersistedQueryCache(), storage.clearAll(ACCOUNT_SCOPED_KEYS)]);
  await useAuthStore.getState().logout();
}
