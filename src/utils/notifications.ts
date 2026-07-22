import * as Notifications from 'expo-notifications';
import type { Alert } from '@/models/entities';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Enregistrement du push token — présent pour un futur vrai serveur (FCM/APNs).
 * Encapsulé en try/catch : le push distant est limité en Expo Go depuis le SDK 53,
 * mais ne doit jamais faire planter l'app en mode démo 100% local.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

/** Simule le push serveur pour une alerte — notification locale immédiate (CDC1 §11). */
export async function notifyAlert(alert: Alert, childName: string): Promise<void> {
  try {
    const isUrgence = alert.level === 'urgence';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: isUrgence ? `🚨 Urgence — ${childName}` : `⚠️ Pré-alerte — ${childName}`,
        body: alert.reasons.join(', ') || 'Comportement inhabituel détecté',
        data: { childId: alert.childId, alertId: alert.id, level: alert.level },
        sound: true,
        priority: isUrgence ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
  } catch {
    // Aucune notification silencieuse critique : en cas d'échec, l'UI in-app (EmergencyGate,
    // liste des alertes) reste la source de vérité.
  }
}
