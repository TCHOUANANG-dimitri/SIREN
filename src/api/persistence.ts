import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { CONTRACT_VERSION } from './contracts';
import { CACHE_MAX_AGE_MS } from './queryClient';

/**
 * Cache hors-ligne persistant (CDC App §6) : dernière position, statut, score,
 * alertes, lieux et périmètres. L'historique, l'audit et la zone de recherche
 * ne sont pas persistés (volume, sensibilité). Purgé à la déconnexion.
 */
const STORAGE_KEY = 'siren.queryCache.v1';

const PERSISTED_CHILD_RESOURCES = new Set(['status', 'position', 'risk', 'alerts', 'places', 'geofences']);

export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  if (queryKey[0] === 'alerts' && queryKey[1] === 'all') return true;
  if (queryKey[0] !== 'children') return false;
  if (queryKey.length === 1) return true;
  return queryKey.length === 3 && PERSISTED_CHILD_RESOURCES.has(String(queryKey[2]));
}

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: STORAGE_KEY, throttleTime: 2000 });

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: CACHE_MAX_AGE_MS,
  // Un changement de version d'app ou de contrat invalide le cache (formats incompatibles).
  buster: `${Constants.expoConfig?.version ?? '0'}-${CONTRACT_VERSION.api}-${CONTRACT_VERSION.schema}`,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === 'success' && shouldPersistQuery(query.queryKey),
    shouldDehydrateMutation: (mutation) => mutation.state.isPaused && mutation.options.meta?.offlineQueue === true,
  },
};

export async function clearPersistedQueryCache() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
