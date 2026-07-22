import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { BiometricGate } from '@/features/auth/BiometricGate';
import { OfflineBanner } from '@/features/tracking/OfflineBanner';
import { registerForPushNotificationsAsync } from '@/utils/notifications';
import { logger } from '@/utils/logger';

export default function MainLayout() {
  const { isAuthenticated } = useAuthGate();

  useEffect(() => {
    if (!isAuthenticated) return;
    registerForPushNotificationsAsync().then((token) => {
      if (token) logger.info('Push token enregistré (démo, non transmis à un vrai serveur)', { token });
    });
  }, [isAuthenticated]);

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <BiometricGate>
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
