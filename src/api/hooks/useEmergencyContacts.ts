import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '../queryKeys';
import * as emergencyContactsService from '../services/emergencyContactsService';

export function useEmergencyContacts(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: queryKeys.emergencyContacts(childId ?? ''),
    queryFn: () => emergencyContactsService.listEmergencyContacts(token, childId as string),
    enabled: !!token && !!childId,
  });
}

export function useCreateEmergencyContact(childId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { nom: string; telephone: string }) =>
      emergencyContactsService.createEmergencyContact(token, childId as string, input),
    onSuccess: () => {
      if (childId) queryClient.invalidateQueries({ queryKey: queryKeys.emergencyContacts(childId) });
    },
  });
}
