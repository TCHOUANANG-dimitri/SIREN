import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as childrenService from '../services/childrenService';
import type { Child } from '@/models/entities';

export function useChildren() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.children,
    queryFn: () => childrenService.listChildren(token),
    enabled: !!token,
  });
}

export function useChildStatus(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.childStatus(childId ?? ''),
    queryFn: () => childrenService.getChildStatus(token, childId as string),
    enabled: !!token && !!childId,
    refetchInterval: 15000,
  });
}

export function useCreateChild() {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { prenom: string; deviceId: string; photoUrl?: string }) =>
      childrenService.createChild(token, input),
    onSuccess: (child: Child) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.children });
      queryClient.setQueryData(queryKeys.childStatus(child.id), undefined);
    },
  });
}

export function useFindDevice() {
  return useMutation({
    mutationFn: (deviceId: string) => childrenService.findDeviceById(deviceId),
  });
}

export function usePatchChildContext(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof childrenService.patchChildContext>[2]) =>
      childrenService.patchChildContext(token, childId as string, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.children });
    },
  });
}
