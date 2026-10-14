import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { parseNotificationData, type NotificationTarget } from '@/utils/notifications';

function openTarget(target: NotificationTarget) {
  if (target.level === 'urgence') {
    router.push({ pathname: '/(emergency)/urgence', params: { childId: target.childId } });
  } else if (target.alertId) {
    router.push({ pathname: '/(main)/alerts/[id]', params: { id: target.alertId } });
  } else {
    router.push({ pathname: '/(main)/children/[id]', params: { id: target.childId } });
  }
}

/**
 * Le tap sur une notification ouvre l'écran contextuel — CDC App §5, y compris
 * quand l'app était fermée (réponse récupérée au démarrage). Monté dans la
 * pile authentifiée : aucune navigation n'a lieu sans session.
 */
export function useNotificationDeepLink() {
  useEffect(() => {
    let handledColdStart = false;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response || handledColdStart) return;
        handledColdStart = true;
        const target = parseNotificationData(response.notification.request.content.data);
        if (target) openTarget(target);
      })
      .catch(() => {});

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handledColdStart = true;
      const target = parseNotificationData(response.notification.request.content.data);
      if (target) openTarget(target);
    });
    return () => subscription.remove();
  }, []);
}
