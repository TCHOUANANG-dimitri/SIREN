import type { QueryClient } from '@tanstack/react-query';
import { api } from '.';
import { queryKeys } from './queryKeys';
import type { GeofenceInput, PlacePatch } from './repositories';

/**
 * File des actions non critiques rejouées au retour du réseau (CDC App §6).
 * Seules ces éditions sont admissibles ; urgence, mobilisation, alertes et
 * paiement exigent le réseau et échouent immédiatement hors-ligne.
 *
 * Ordre : toutes les actions partagent le même `scope` et sont rejouées en
 * série dans l'ordre de saisie. Conflit : la dernière écriture l'emporte
 * côté serveur (pas de verrou de version dans le contrat v1).
 */
export const OFFLINE_SCOPE = { id: 'offline-queue' } as const;

export const offlineMutationKeys = {
  patchPlace: ['offline', 'patchPlace'] as const,
  patchGeofence: ['offline', 'patchGeofence'] as const,
};

export interface PatchPlaceVars {
  childId: string;
  placeId: string;
  patch: PlacePatch;
}

export interface PatchGeofenceVars {
  childId: string;
  geofenceId: string;
  patch: Partial<GeofenceInput>;
}

const queued = { networkMode: 'online' as const, scope: OFFLINE_SCOPE, meta: { offlineQueue: true }, retry: 3 };

/** Les fonctions sont enregistrées par clé pour survivre à un redémarrage (mutations persistées). */
export function registerOfflineMutations(client: QueryClient) {
  client.setMutationDefaults(offlineMutationKeys.patchPlace, {
    ...queued,
    mutationFn: ({ placeId, patch }: PatchPlaceVars) => api.places.patch(placeId, patch),
    onSettled: (_d, _e, vars: PatchPlaceVars) => client.invalidateQueries({ queryKey: queryKeys.places(vars.childId) }),
  });
  client.setMutationDefaults(offlineMutationKeys.patchGeofence, {
    ...queued,
    mutationFn: ({ geofenceId, patch }: PatchGeofenceVars) => api.geofences.patch(geofenceId, patch),
    onSettled: (_d, _e, vars: PatchGeofenceVars) => client.invalidateQueries({ queryKey: queryKeys.geofences(vars.childId) }),
  });
}
