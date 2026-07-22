import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as riskService from '../services/riskService';

export function useRisk(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.risk(childId ?? ''),
    queryFn: () => riskService.getRisk(token, childId as string),
    enabled: !!token && !!childId,
    refetchInterval: 15000,
  });
}

export function useRiskHistory(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.riskHistory(childId ?? ''),
    queryFn: () => riskService.getRiskHistory(token, childId as string),
    enabled: !!token && !!childId,
    refetchInterval: 15000,
  });
}
