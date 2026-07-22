import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as sharingService from '../services/sharingService';
import type { Permission, SecondaryAccess } from '@/models/entities';

export function useShares(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.shares(childId ?? ''),
    queryFn: () => sharingService.listShares(token, childId as string),
    enabled: !!token && !!childId,
  });
}

export function useShare(shareId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['shares', shareId ?? ''] as const,
    queryFn: () => sharingService.getShare(token, shareId as string),
    enabled: !!token && !!shareId,
  });
}

export function useCreateShare(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userIdentifier: string; permissions: Permission[] }) =>
      sharingService.createShare(token, childId as string, input),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.shares(childId) });
    },
  });
}

export function usePatchShare(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      shareId,
      patch,
    }: {
      shareId: string;
      patch: { permissions?: Permission[]; status?: SecondaryAccess['status'] };
    }) => sharingService.patchShare(token, shareId, patch),
    onSuccess: (_result, variables) => {
      if (childId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.shares(childId) });
        queryClient.invalidateQueries({ queryKey: [...queryKeys.shares(childId), 'mine'] });
      }
      queryClient.invalidateQueries({ queryKey: ['shares', variables.shareId] });
    },
  });
}

export function useMyPermissions(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: [...queryKeys.shares(childId ?? ''), 'mine'] as const,
    queryFn: () => sharingService.getMyPermissions(token, childId as string),
    enabled: !!token && !!childId,
  });
}

export function useAccessAudit(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.accessAudit(childId ?? ''),
    queryFn: () => sharingService.listAccessAudit(token, childId as string),
    enabled: !!token && !!childId,
  });
}
