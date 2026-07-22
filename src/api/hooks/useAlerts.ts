import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as alertsService from '../services/alertsService';
import type { Alert } from '@/models/entities';

export function useAlerts(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.alerts(childId ?? ''),
    queryFn: () => alertsService.listAlerts(token, childId as string),
    enabled: !!token && !!childId,
  });
}

export function useAllAlerts() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.allAlerts,
    queryFn: () => alertsService.listAllAlerts(token),
    enabled: !!token,
  });
}

export function usePatchAlert() {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, status }: { alertId: string; status: Alert['status'] }) =>
      alertsService.patchAlert(token, alertId, status),
    onSuccess: (alert) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allAlerts });
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts(alert.childId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.risk(alert.childId) });
    },
  });
}
