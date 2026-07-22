import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useChildren } from '@/api/hooks/useChildren';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { mockEventBus, type BusEvent } from '@/api/mock/mockEventBus';
import { notifyAlert } from '@/utils/notifications';

/**
 * Ouvre automatiquement la pile (emergency) dès qu'un enfant suivi bascule en urgence —
 * CDC1 parcours 10.3. Aucun écran individuel n'a besoin de connaître cette règle.
 */
export function EmergencyGate() {
  const { isAuthenticated } = useAuthGate();
  const { data: children } = useChildren();
  const lastTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const watchedIds = new Set((children ?? []).map((c) => c.id));

    const unsubscribe = mockEventBus.subscribe((event: BusEvent) => {
      if (event.type === 'state_change' && watchedIds.has(event.childId) && event.to === 'urgence') {
        const key = `${event.childId}:${event.to}`;
        if (lastTriggeredRef.current === key) return;
        lastTriggeredRef.current = key;
        router.push({ pathname: '/(emergency)/urgence', params: { childId: event.childId } });
      }
      if (event.type === 'alert' && watchedIds.has(event.alert.childId)) {
        const childName = children?.find((c) => c.id === event.alert.childId)?.prenom ?? 'Enfant';
        void notifyAlert(event.alert, childName);
      }
    });
    return unsubscribe;
  }, [isAuthenticated, children]);

  return null;
}
