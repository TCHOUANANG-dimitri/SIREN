import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';
import type { Alert } from '@/models/entities';

export function useAlerts(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.alerts(childId ?? ''),
    queryFn: () => api.alerts.listForChild(childId as string),
    enabled: !!token && !!childId,
  });
}

export function useAllAlerts() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.allAlerts,
    queryFn: () => api.alerts.listAll(),
    enabled: !!token,
  });
}

export function usePatchAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, status }: { alertId: string; status: Alert['status'] }) =>
      api.alerts.patch(alertId, status),
    onSuccess: (alert) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allAlerts });
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts(alert.childId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.risk(alert.childId) });
    },
  });
}
