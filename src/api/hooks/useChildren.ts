import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';
import type { Child } from '@/models/entities';

export function useChildren() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.children,
    queryFn: () => api.children.list(),
    enabled: !!token,
  });
}

export function useChildStatus(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.childStatus(childId ?? ''),
    queryFn: () => api.children.getStatus(childId as string),
    enabled: !!token && !!childId,
    refetchInterval: 15000,
  });
}

export function useCreateChild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { prenom: string; deviceId: string; photoUrl?: string }) =>
      api.children.create(input),
    onSuccess: (child: Child) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.children });
      queryClient.setQueryData(queryKeys.childStatus(child.id), undefined);
    },
  });
}

export function useFindDevice() {
  return useMutation({
    mutationFn: (deviceId: string) => api.children.findDevice(deviceId),
  });
}

export function usePatchChildContext(childId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Child, 'sleepSchedule'>>) =>
      api.children.patchContext(childId as string, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.children });
    },
  });
}
