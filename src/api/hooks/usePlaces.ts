import { onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';
import type { Place } from '@/models/entities';
import type { PlacePatch } from '../repositories';
import { offlineMutationKeys, type PatchPlaceVars } from '../offlineQueue';

export function usePlaces(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.places(childId ?? ''),
    queryFn: () => api.places.list(childId as string),
    enabled: !!token && !!childId,
  });
}

export function useCreatePlace(childId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Place, 'id' | 'childId' | 'source'>) =>
      api.places.create(childId as string, input),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.places(childId) });
    },
  });
}

/**
 * Renommage / rayon d'un lieu : action non critique mise en file hors-ligne.
 * La mise à jour est appliquée tout de suite à l'écran, puis rejouée au retour du réseau.
 */
export function usePatchPlace(childId: string | undefined) {
  const queryClient = useQueryClient();
  const mutation = useMutation<Place, Error, PatchPlaceVars>({
    mutationKey: offlineMutationKeys.patchPlace,
    onMutate: ({ placeId, patch, childId: cid }) => {
      queryClient.setQueryData<Place[]>(queryKeys.places(cid), (places) =>
        places?.map((p) => (p.id === placeId ? { ...p, ...patch } : p))
      );
    },
  });
  return {
    isPending: mutation.isPending && !mutation.isPaused,
    isQueued: mutation.isPaused,
    mutateAsync: async (vars: { placeId: string; patch: PlacePatch }) => {
      if (!childId) return;
      const full = { ...vars, childId };
      if (!onlineManager.isOnline()) {
        mutation.mutate(full);
        return;
      }
      await mutation.mutateAsync(full);
    },
  };
}
