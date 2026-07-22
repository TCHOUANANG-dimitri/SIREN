import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as trackingService from '../services/trackingService';

export function usePosition(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.position(childId ?? ''),
    queryFn: () => trackingService.getPosition(token, childId as string),
    enabled: !!token && !!childId,
    refetchInterval: 20000,
  });
}

export function useHistory(childId: string | undefined, from?: string, to?: string) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.history(childId ?? '', from, to),
    queryFn: () => trackingService.getHistory(token, childId as string, from, to),
    enabled: !!token && !!childId,
  });
}

export function useZoneState(childId: string | undefined, enabled: boolean) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: [...queryKeys.position(childId ?? ''), 'zoneState'] as const,
    queryFn: () => trackingService.getZoneState(token, childId as string),
    enabled: !!token && !!childId && enabled,
    refetchInterval: 20000,
  });
}

export function useRequestPositionFix(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => trackingService.requestPositionFix(token, childId as string),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.position(childId) });
    },
  });
}
