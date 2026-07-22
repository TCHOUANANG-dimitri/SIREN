import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as communityService from '../services/communityService';

export function useCommunityReports() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.community,
    queryFn: () => communityService.listCommunityReports(token),
    enabled: !!token,
  });
}

export function useCreateCommunityReport() {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { description: string; lat: number; lon: number }) =>
      communityService.createCommunityReport(token, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.community });
    },
  });
}
