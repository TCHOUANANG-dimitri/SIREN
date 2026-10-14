import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import { api } from '..';

export function useEmergencyContacts(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.emergencyContacts(childId ?? ''),
    queryFn: () => api.emergencyContacts.list(childId as string),
    enabled: !!token && !!childId,
  });
}

export function useCreateEmergencyContact(childId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { nom: string; telephone: string }) =>
      api.emergencyContacts.create(childId as string, input),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.emergencyContacts(childId) });
    },
  });
}
