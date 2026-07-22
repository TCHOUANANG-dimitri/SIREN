import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

/** Le tap sur une notification ouvre l'écran contextuel adéquat — CDC1 §11. */
export function useNotificationDeepLink() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { childId?: string; alertId?: string; level?: 'prealerte' | 'urgence' }
        | undefined;
      if (!data?.childId) return;
      if (data.level === 'urgence') {
        router.push({ pathname: '/(emergency)/urgence', params: { childId: data.childId } });
      } else if (data.alertId) {
        router.push(`/(main)/alerts/${data.alertId}`);
      }
    });
    return () => subscription.remove();
  }, []);
}
