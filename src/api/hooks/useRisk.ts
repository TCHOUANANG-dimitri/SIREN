import { useQueries, useQuery } from '@tanstack/react-query';
import { featureFlags } from '@/config/env';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';

export function useRisk(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.risk(childId ?? ''),
    queryFn: () => api.risk.get(childId as string),
    enabled: !!token && !!childId,
    refetchInterval: 15000,
  });
}

export function useRiskHistory(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.riskHistory(childId ?? ''),
    queryFn: () => api.risk.history(childId as string),
    enabled: !!token && !!childId,
    refetchInterval: 15000,
  });
}

/** Avec WebSocket, les mises à jour arrivent en poussée : le polling devient un filet de sécurité. */
const RISK_POLL_MS = featureFlags.websocket ? 60_000 : 15_000;

/** Surveille le score de chaque enfant suivi pendant toute la session. */
export function useRiskWatch(childIds: string[]) {
  const token = useAuthStore((s) => s.accessToken);
  return useQueries({
    queries: childIds.map((childId) => ({
      queryKey: queryKeys.risk(childId),
      queryFn: () => api.risk.get(childId),
      enabled: !!token,
      refetchInterval: RISK_POLL_MS,
    })),
  });
}
