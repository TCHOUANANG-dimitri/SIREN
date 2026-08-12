import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '@/api/queryClient';
import { initMockBackend } from '@/api/mock/bootstrap';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { useAppFonts } from '@/theme';
import { EmergencyGate } from '@/features/emergency/EmergencyGate';
import { useNotificationDeepLink } from '@/features/notifications/useNotificationDeepLink';
import { ErrorBoundary } from '@/components';
import { logger } from '@/utils/logger';
import '@/i18n';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { fontsLoaded, fontsError } = useAppFonts();
  const [backendReady, setBackendReady] = useState(false);
  const hydrate = useAuthStore((s) => s.hydrate);
  const initLocation = useLocationStore((s) => s.initialize);
  useNotificationDeepLink();

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([hydrate(), initMockBackend(), initLocation()]);
      } catch (error) {
        logger.error(error, { stage: 'bootstrap' });
      } finally {
        setBackendReady(true);
      }
    })();
  }, [hydrate]);

  const ready = (fontsLoaded || !!fontsError) && backendReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" />
            <EmergencyGate />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(main)" />
              <Stack.Screen
                name="(emergency)"
                options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }}
              />
            </Stack>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
