import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as geofencesService from '../services/geofencesService';
import type { Geofence } from '@/models/entities';

export function useGeofences(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.geofences(childId ?? ''),
    queryFn: () => geofencesService.listGeofences(token, childId as string),
    enabled: !!token && !!childId,
  });
}

export function useCreateGeofence(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Geofence, 'id' | 'childId'>) =>
      geofencesService.createGeofence(token, childId as string, input),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.geofences(childId) });
    },
  });
}

export function usePatchGeofence(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ geofenceId, patch }: { geofenceId: string; patch: Partial<Omit<Geofence, 'id' | 'childId'>> }) =>
      geofencesService.patchGeofence(token, geofenceId, patch),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.geofences(childId) });
    },
  });
}

export function useDeleteGeofence(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (geofenceId: string) => geofencesService.deleteGeofence(token, geofenceId),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.geofences(childId) });
    },
  });
}
