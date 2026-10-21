import { useEffect } from 'react';
import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { BiometricGate } from '@/features/auth/BiometricGate';
import { OfflineBanner } from '@/features/tracking/OfflineBanner';
import { useNotificationDeepLink } from '@/features/notifications/useNotificationDeepLink';
import { useChildren } from '@/api/hooks/useChildren';
import { useRiskWatch } from '@/api/hooks/useRisk';
import { useRealtimeBridge } from '@/api/hooks/useRealtimeBridge';
import { api } from '@/api';
import { syncPushToken } from '@/utils/notifications';
import { logger } from '@/utils/logger';
import { useAuthStore } from '@/stores/authStore';
import { reconcileAccountLanguage } from '@/i18n/language';

/** Services actifs pendant toute la session : temps réel, push, liens de notification. */
function SessionServices() {
  const { data: children } = useChildren();
  const childIds = (children ?? []).map((c) => c.id);
  useRealtimeBridge(childIds);
  // Scores de tous les enfants suivis, en continu : c'est ce qui déclenche l'écran
  // d'urgence quand le temps réel n'est pas disponible (polling REST).
  useRiskWatch(childIds);
  useNotificationDeepLink();

  // Langue : choix fait sur ce téléphone > langue du compte > langue du téléphone.
  // Le serveur doit connaître la langue effective (push et emails sont rédigés par lui).
  const langue = useAuthStore((s) => s.user?.langue);
  useEffect(() => {
    reconcileAccountLanguage(langue)
      .then((toSync) => (toSync ? api.users.patchMe({ langue: toSync }) : undefined))
      .catch((error) => logger.warn('Langue non synchronisée avec le compte', { errorCode: String(error) }));
  }, [langue]);

  useEffect(() => {
    // En mock, aucun serveur ne recevrait le jeton : on n'en demande pas.
    if (api.mode !== 'live') return;
    let unsubscribe: (() => void) | undefined;
    syncPushToken((token) => api.users.registerPushToken(token))
      .then((stop) => {
        unsubscribe = stop;
      })
      .catch((error) => logger.warn('Synchronisation du jeton push impossible', { error: String(error) }));
    return () => unsubscribe?.();
  }, []);

  return null;
}

export default function MainLayout() {
  const { isAuthenticated } = useAuthGate();
  const phoneRequired = useAuthStore((s) => !!s.user?.phoneRequired);
  const pathname = usePathname();

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  // Compte ancien sans téléphone : le numéro (désormais obligatoire) est complété
  // avant tout le reste. L'écran d'urgence reste hors de ce parcours ((emergency)).
  if (phoneRequired && pathname !== '/settings/phone') return <Redirect href="/(main)/settings/phone" />;

  return (
    <BiometricGate>
      <SessionServices />
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-child" options={{ presentation: 'modal' }} />
        <Stack.Screen name="context-wizard" options={{ presentation: 'modal' }} />
        <Stack.Screen name="children/[id]/index" />
        <Stack.Screen name="geofences/index" />
        <Stack.Screen name="geofences/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="community" />
        <Stack.Screen name="alerts/[id]" />
        <Stack.Screen name="sharing/invite" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sharing/[id]" />
        <Stack.Screen name="sharing/audit" />
        <Stack.Screen name="settings/phone" />
      </Stack>
    </BiometricGate>
  );
}
