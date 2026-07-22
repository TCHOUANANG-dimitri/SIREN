import { Stack } from 'expo-router';

export default function EmergencyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'fade' }}>
      <Stack.Screen name="urgence" />
      <Stack.Screen name="post-disparition" />
      <Stack.Screen name="ecoute-audio" options={{ presentation: 'modal', gestureEnabled: true }} />
    </Stack>
  );
}
