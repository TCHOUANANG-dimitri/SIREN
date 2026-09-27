import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';

export function useCommunityReports() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.community,
    queryFn: () => api.community.list(),
    enabled: !!token,
  });
}

export function useCreateCommunityReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { description: string; lat: number; lon: number }) =>
      api.community.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.community });
    },
  });
}
