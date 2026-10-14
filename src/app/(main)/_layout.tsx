import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
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
import i18n from '@/i18n';

/** Services actifs pendant toute la session : temps réel, push, liens de notification. */
function SessionServices() {
  const { data: children } = useChildren();
  const childIds = (children ?? []).map((c) => c.id);
  useRealtimeBridge(childIds);
  // Scores de tous les enfants suivis, en continu : c'est ce qui déclenche l'écran
  // d'urgence quand le temps réel n'est pas disponible (polling REST).
  useRiskWatch(childIds);
  useNotificationDeepLink();

  // La langue choisie est un réglage de compte : elle suit le parent d'un téléphone à l'autre.
  const langue = useAuthStore((s) => s.user?.langue);
  useEffect(() => {
    if (langue && i18n.language !== langue) void i18n.changeLanguage(langue);
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

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

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
      </Stack>
    </BiometricGate>
  );
}
