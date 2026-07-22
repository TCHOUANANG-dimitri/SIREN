import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as searchZoneService from '../services/searchZoneService';

export function useSearchZone(childId: string | undefined, enabled: boolean) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.searchZone(childId ?? ''),
    queryFn: () => searchZoneService.getSearchZone(token, childId as string),
    enabled: !!token && !!childId && enabled,
    refetchInterval: 10000,
    retry: false,
  });
}

export function useTriggerDisappearance(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => searchZoneService.postDisappearance(token, childId as string),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.risk(childId) });
    },
  });
}
