import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Alert } from '@/models/entities';
import i18n from '@/i18n';
import { logger } from '@/utils/logger';
import { storage } from '@/utils/storage';

/**
 * Notifications — CDC App §5.
 * Trois canaux Android : urgence (priorité max, son), pré-alerte, information.
 * En mode live, le push est émis par le serveur (FCM / APNs) : l'app se borne
 * à enregistrer son jeton et à router le tap. En mode mock, des notifications
 * locales simulent le push.
 */

export const NOTIFICATION_CHANNELS = {
  urgence: 'siren-urgence',
  prealerte: 'siren-prealerte',
  information: 'siren-information',
} as const;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.urgence, {
      name: i18n.t('notifications.channelUrgence'),
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 600, 300, 600, 300, 600],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      // N'a d'effet que si l'utilisateur accorde l'accès « Ne pas déranger » dans les réglages système.
      bypassDnd: true,
    });
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.prealerte, {
      name: i18n.t('notifications.channelPrealerte'),
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.information, {
      name: i18n.t('notifications.channelInformation'),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch (error) {
    logger.warn('Création des canaux de notification impossible', { error: String(error) });
  }
}

/** Demande l'autorisation ; `null` si refusée — l'app reste utilisable sans push. */
async function ensurePermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export interface DevicePushToken {
  token: string;
  platform: 'fcm' | 'apns';
}

/**
 * Jeton natif FCM (Android) / APNs (iOS), celui qu'attend le serveur SIREN
 * (envoi direct via firebase-admin, pas via le service Expo Push).
 * Nécessite google-services.json dans la build Android ; sinon renvoie null.
 */
export async function getDevicePushToken(): Promise<DevicePushToken | null> {
  try {
    if (!(await ensurePermission())) return null;
    const result = await Notifications.getDevicePushTokenAsync();
    if (typeof result.data !== 'string' || !result.data) return null;
    return { token: result.data, platform: Platform.OS === 'ios' ? 'apns' : 'fcm' };
  } catch (error) {
    logger.warn('Jeton push indisponible', { error: String(error) });
    return null;
  }
}

const PUSH_TOKEN_KEY = 'siren.pushToken';

/**
 * Enregistre le jeton côté serveur s'il a changé, et suit ses renouvellements.
 * Renvoie une fonction de désabonnement.
 */
export async function syncPushToken(register: (token: DevicePushToken) => Promise<void>): Promise<() => void> {
  const send = async (token: DevicePushToken) => {
    const previous = await storage.getItem<string>(PUSH_TOKEN_KEY);
    if (previous === token.token) return;
    await register(token);
    await storage.setItem(PUSH_TOKEN_KEY, token.token);
  };
  const initial = await getDevicePushToken();
  if (initial) await send(initial).catch((error) => logger.warn('Enregistrement push refusé', { error: String(error) }));
  const subscription = Notifications.addPushTokenListener((next) => {
    if (typeof next.data !== 'string') return;
    void send({ token: next.data, platform: Platform.OS === 'ios' ? 'apns' : 'fcm' }).catch(() => {});
  });
  return () => subscription.remove();
}

/** Données de routage d'une notification, quel que soit le format émetteur. */
export interface NotificationTarget {
  childId: string;
  alertId?: string;
  level: 'urgence' | 'prealerte' | 'information';
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Valide la charge utile avant toute navigation : le serveur v1 envoie
 * `child_id` / `alert_id`, le mock `childId` / `alertId`. Un identifiant au
 * format inattendu est rejeté (pas de navigation vers une route forgée).
 */
export function parseNotificationData(data: unknown): NotificationTarget | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const childId = d.childId ?? d.child_id;
  const alertId = d.alertId ?? d.alert_id;
  if (typeof childId !== 'string' || !SAFE_ID.test(childId)) return null;
  if (alertId !== undefined && (typeof alertId !== 'string' || !SAFE_ID.test(alertId))) return null;
  const level = d.level === 'urgence' || d.level === 'prealerte' ? d.level : 'information';
  return { childId, alertId: alertId as string | undefined, level };
}

/** Mode mock uniquement : notification locale simulant le push serveur. */
export async function notifyAlert(alert: Alert, childName: string): Promise<void> {
  try {
    const isUrgence = alert.level === 'urgence';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: isUrgence
          ? i18n.t('notifications.urgenceTitle', { child: childName })
          : i18n.t('notifications.prealerteTitle', { child: childName }),
        body: alert.reasons.join(', ') || i18n.t('notifications.defaultBody'),
        data: { childId: alert.childId, alertId: alert.id, level: alert.level },
        sound: true,
        priority: isUrgence ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: Platform.OS === 'android'
        ? { channelId: isUrgence ? NOTIFICATION_CHANNELS.urgence : NOTIFICATION_CHANNELS.prealerte }
        : null,
    });
  } catch {
    // En cas d'échec, l'UI in-app (EmergencyGate, liste des alertes) reste la source de vérité.
  }
}
