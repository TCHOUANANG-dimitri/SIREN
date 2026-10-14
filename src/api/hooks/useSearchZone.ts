import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';

export function useSearchZone(childId: string | undefined, enabled: boolean) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.searchZone(childId ?? ''),
    queryFn: () => api.searchZone.get(childId as string),
    enabled: !!token && !!childId && enabled,
    refetchInterval: 10000,
    retry: false,
  });
}

export function useTriggerDisappearance(childId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.searchZone.declareDisappearance(childId as string),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.risk(childId) });
    },
  });
}
