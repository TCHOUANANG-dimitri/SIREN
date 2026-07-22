import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { SplashVisual } from '@/features/auth/SplashVisual';
import { storage } from '@/utils/storage';

const ONBOARDING_KEY = 'siren.onboarding.seen';

export default function SplashRoute() {
  const { isAuthenticated } = useAuthGate();
  const [checked, setChecked] = useState(false);
  const [seenOnboarding, setSeenOnboarding] = useState(false);

  useEffect(() => {
    storage.getItem<boolean>(ONBOARDING_KEY).then((value) => {
      setSeenOnboarding(!!value);
      setChecked(true);
    });
  }, []);

  if (!checked) return <SplashVisual />;
  if (isAuthenticated) return <Redirect href="/(main)/(tabs)" />;
  if (!seenOnboarding) return <Redirect href="/(auth)/onboarding" />;
  return <Redirect href="/(auth)/login" />;
}
