import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/stores/uiStore';
import { queryKeys } from '../queryKeys';
import { getRealtimeChannel, type RealtimeEvent } from '../realtime';

/**
 * Pont unique canal temps réel → cache React Query, monté une fois dans la
 * pile principale. Les GET REST restent la source de vérité : un événement
 * complet met à jour le cache, un événement partiel l'invalide (refetch).
 */
export function useRealtimeBridge(childIds: string[]) {
  const queryClient = useQueryClient();
  const setConnectionStatus = useUiStore((s) => s.setConnectionStatus);
  const key = childIds.join(',');

  useEffect(() => {
    const channel = getRealtimeChannel();
    channel.watch(key ? key.split(',') : []);
  }, [key]);

  useEffect(() => {
    const channel = getRealtimeChannel();
    setConnectionStatus(channel.getStatus());
    return channel.subscribe((event: RealtimeEvent) => {
      switch (event.type) {
        case 'position_update':
          if (event.position) queryClient.setQueryData(queryKeys.position(event.childId), event.position);
          else queryClient.invalidateQueries({ queryKey: queryKeys.position(event.childId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.childStatus(event.childId) });
          break;
        case 'risk_update':
          if (event.risk) queryClient.setQueryData(queryKeys.risk(event.childId), event.risk);
          else queryClient.invalidateQueries({ queryKey: queryKeys.risk(event.childId) });
          break;
        case 'alert':
          queryClient.invalidateQueries({ queryKey: queryKeys.alerts(event.childId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.allAlerts });
          break;
        case 'place_learned':
          queryClient.invalidateQueries({ queryKey: queryKeys.places(event.childId) });
          break;
        case 'connection':
          setConnectionStatus(event.status);
          // Au retour de la connexion, on resynchronise ce qui a pu être manqué.
          if (event.status === 'connected') queryClient.invalidateQueries({ queryKey: ['children'] });
          break;
      }
    });
  }, [queryClient, setConnectionStatus]);
}
