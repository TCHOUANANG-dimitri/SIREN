import { Redirect, Stack } from 'expo-router';
import { useAuthGate } from '@/features/auth/useAuthGate';

export default function AuthLayout() {
  const { isAuthenticated } = useAuthGate();
  if (isAuthenticated) return <Redirect href="/(main)/(tabs)" />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="otp" />
    </Stack>
  );
}
