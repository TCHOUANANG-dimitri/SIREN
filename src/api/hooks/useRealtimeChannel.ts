import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mockEventBus, type BusEvent } from '../mock/mockEventBus';
import { queryKeys } from '../queryKeys';

/**
 * Pont event bus mocké -> cache React Query, pour un enfant donné. Les GET REST restent
 * la source de vérité au focus/pull-to-refresh ; ce canal pousse juste les mises à jour
 * live avec une latence perçue ~0 — CDC1 §6 (canal WS) / §14 (micro-interactions).
 */
export function useRealtimeChannel(childId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!childId) return;
    const unsubscribe = mockEventBus.subscribe((event: BusEvent) => {
      switch (event.type) {
        case 'position_update':
          if (event.childId === childId) {
            queryClient.setQueryData(queryKeys.position(childId), event.position);
          }
          break;
        case 'risk_update':
          if (event.childId === childId) {
            queryClient.setQueryData(queryKeys.risk(childId), event.risk);
          }
          break;
        case 'alert':
          if (event.alert.childId === childId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.alerts(childId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.allAlerts });
          }
          break;
        case 'place_learned':
          if (event.childId === childId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.places(childId) });
          }
          break;
        default:
          break;
      }
    });
    return unsubscribe;
  }, [childId, queryClient]);
}
