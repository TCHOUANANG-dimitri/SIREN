import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { logger } from '@/utils/logger';
import { ApiError } from './errors';

/**
 * Politique de cache (CDC App §6) :
 *  - lectures : 10 s de fraîcheur, 24 h de conservation (cache hors-ligne) ;
 *  - pas de nouvelle tentative React Query sur 4xx : le client HTTP gère déjà
 *    les reprises sûres (réseau / 5xx) ;
 *  - écritures : échec immédiat hors-ligne (`always`), sauf les éditions non
 *    critiques explicitement mises en file (voir `offlineQueue.ts`).
 */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error instanceof ApiError && (error.code === 'not_found' || error.code === 'forbidden')) return;
      logger.warn('Échec de chargement', { resource: String(query.queryKey[0]), errorCode: (error as ApiError).code });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      logger.warn('Échec d’écriture', { resource: String(mutation.options.mutationKey?.[1] ?? 'anonyme'), errorCode: (error as ApiError).code });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: CACHE_MAX_AGE_MS,
      retry: (failureCount, error) => failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'always',
      retry: false,
    },
  },
});
