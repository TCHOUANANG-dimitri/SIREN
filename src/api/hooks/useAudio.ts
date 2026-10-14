import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';

export function useAudioLogs(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.audioLogs(childId ?? ''),
    queryFn: () => api.audio.logs(childId as string),
    enabled: !!token && !!childId,
  });
}

export function useRequestAudioActivation(childId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reason: string; explicitRequest?: boolean }) =>
      api.audio.activate(childId as string, input),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.audioLogs(childId) });
    },
  });
}
