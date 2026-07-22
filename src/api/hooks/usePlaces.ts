import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as placesService from '../services/placesService';
import type { Place } from '@/models/entities';

export function usePlaces(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.places(childId ?? ''),
    queryFn: () => placesService.listPlaces(token, childId as string),
    enabled: !!token && !!childId,
  });
}

export function useCreatePlace(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Place, 'id' | 'childId' | 'source'>) =>
      placesService.createPlace(token, childId as string, input),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.places(childId) });
    },
  });
}

export function usePatchPlace(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ placeId, patch }: { placeId: string; patch: Partial<Pick<Place, 'nom' | 'radiusM' | 'isNew'>> }) =>
      placesService.patchPlace(token, placeId, patch),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.places(childId) });
    },
  });
}
