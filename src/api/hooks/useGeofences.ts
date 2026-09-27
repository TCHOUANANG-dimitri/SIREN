import { onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';
import type { Geofence } from '@/models/entities';
import type { GeofenceInput } from '../repositories';
import { offlineMutationKeys, type PatchGeofenceVars } from '../offlineQueue';

export function useGeofences(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.geofences(childId ?? ''),
    queryFn: () => api.geofences.list(childId as string),
    enabled: !!token && !!childId,
  });
}

export function useCreateGeofence(childId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Geofence, 'id' | 'childId'>) =>
      api.geofences.create(childId as string, input),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.geofences(childId) });
    },
  });
}

/** Édition d'un périmètre : action non critique mise en file hors-ligne (voir usePatchPlace). */
export function usePatchGeofence(childId: string | undefined) {
  const queryClient = useQueryClient();
  const mutation = useMutation<Geofence, Error, PatchGeofenceVars>({
    mutationKey: offlineMutationKeys.patchGeofence,
    onMutate: ({ geofenceId, patch, childId: cid }) => {
      queryClient.setQueryData<Geofence[]>(queryKeys.geofences(cid), (fences) =>
        fences?.map((g) => (g.id === geofenceId ? { ...g, ...patch } : g))
      );
    },
  });
  return {
    isPending: mutation.isPending && !mutation.isPaused,
    isQueued: mutation.isPaused,
    mutateAsync: async (vars: { geofenceId: string; patch: Partial<GeofenceInput> }) => {
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

export function useDeleteGeofence(childId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (geofenceId: string) => api.geofences.remove(geofenceId),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.geofences(childId) });
    },
  });
}
