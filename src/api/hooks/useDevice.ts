import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as deviceService from '../services/deviceService';
import type { DeviceStatus } from '@/models/entities';

export function useDeviceSettings(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.deviceSettings(childId ?? ''),
    queryFn: () => deviceService.getDeviceSettings(token, childId as string),
    enabled: !!token && !!childId,
  });
}

export function usePatchDeviceSettings(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<DeviceStatus, 'energyMode' | 'sensitivity'>>) =>
      deviceService.patchDeviceSettings(token, childId as string, patch),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.deviceSettings(childId) });
    },
  });
}
