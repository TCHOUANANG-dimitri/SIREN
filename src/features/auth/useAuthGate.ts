import { useAuthStore } from '@/stores/authStore';

export function useAuthGate() {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  return { isHydrated, isAuthenticated: !!accessToken };
}
