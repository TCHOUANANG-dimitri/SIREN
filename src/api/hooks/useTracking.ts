import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';

export function usePosition(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.position(childId ?? ''),
    queryFn: () => api.tracking.getPosition(childId as string),
    enabled: !!token && !!childId,
    refetchInterval: 20000,
  });
}

export function useHistory(childId: string | undefined, from?: string, to?: string) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.history(childId ?? '', from, to),
    queryFn: () => api.tracking.getHistory(childId as string, from, to),
    enabled: !!token && !!childId,
  });
}

export function useZoneState(childId: string | undefined, enabled: boolean) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: [...queryKeys.position(childId ?? ''), 'zoneState'] as const,
    queryFn: () => api.tracking.getZoneState(childId as string),
    enabled: !!token && !!childId && enabled,
    refetchInterval: 20000,
  });
}

export function useRequestPositionFix(childId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.tracking.requestFix(childId as string),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.position(childId) });
    },
  });
}
