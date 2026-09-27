import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';
import type { EnergyMode } from '@/models/entities';

export function useDeviceSettings(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.deviceSettings(childId ?? ''),
    queryFn: () => api.device.getSettings(childId as string),
    enabled: !!token && !!childId,
  });
}

export function usePatchDeviceSettings(childId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: { energyMode?: EnergyMode; sensitivity?: number }) =>
      api.device.patchSettings(childId as string, patch),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.deviceSettings(childId) });
    },
  });
}
