import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '@/api/queryClient';
import { persistOptions } from '@/api/persistence';
import { registerOfflineMutations } from '@/api/offlineQueue';
import { initApiSession } from '@/api/session';
import { isMockMode } from '@/api/network';
import { configIssues, hasBlockingConfigError } from '@/config/env';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { useAppFonts } from '@/theme';
import { EmergencyGate } from '@/features/emergency/EmergencyGate';
import { ConfigErrorScreen } from '@/features/system/ConfigErrorScreen';
import { PrivacyShield } from '@/features/system/PrivacyShield';
import { ErrorBoundary } from '@/components';
import { initConnectivity } from '@/utils/connectivity';
import { ensureNotificationChannels } from '@/utils/notifications';
import { logger } from '@/utils/logger';
import '@/i18n';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Initialisations synchrones et idempotentes, exécutées une seule fois au chargement.
initApiSession();
initConnectivity();
registerOfflineMutations(queryClient);
configIssues.forEach((issue) => logger.warn(`Configuration ${issue.key} : ${issue.message}`, { severity: issue.severity }));

/** Au-delà, l'écran s'affiche même si une initialisation traîne (démarrage < 3 s visé). */
const BOOT_TIMEOUT_MS = 2500;

async function bootstrap(hydrate: () => Promise<void>) {
  const tasks: Promise<unknown>[] = [hydrate()];
  if (isMockMode()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tasks.push(require('@/api/mock/entry').initMockBackend());
  }
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise((resolve) => setTimeout(resolve, BOOT_TIMEOUT_MS)),
  ]);
}

export default function RootLayout() {
  const { fontsLoaded, fontsError } = useAppFonts();
  const [backendReady, setBackendReady] = useState(false);
  const hydrate = useAuthStore((s) => s.hydrate);
  const initLocation = useLocationStore((s) => s.initialize);

  useEffect(() => {
    bootstrap(hydrate)
      .catch((error) => logger.error(error, { stage: 'bootstrap' }))
      .finally(() => setBackendReady(true));
    // Non bloquants : ni la position du téléphone ni les canaux ne doivent retarder l'affichage.
    void initLocation();
    void ensureNotificationChannels();
  }, [hydrate, initLocation]);

  const ready = (fontsLoaded || !!fontsError) && backendReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  if (hasBlockingConfigError) {
    return <ConfigErrorScreen issues={configIssues} />;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={persistOptions}
            onSuccess={() => {
              // Rejoue la file hors-ligne restaurée depuis le disque.
              void queryClient.resumePausedMutations();
            }}
          >
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
            <PrivacyShield />
          </PersistQueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
