import { useAuthStore } from '@/stores/authStore';
import { configureSession } from './http/client';
import { signOut } from '@/features/auth/signOut';

/** Relie le client HTTP à la session persistée (à appeler une fois au démarrage). */
export function initApiSession() {
  configureSession({
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    onTokensRefreshed: (tokens) => useAuthStore.getState().setTokens(tokens),
    onSessionExpired: () => signOut({ revokeOnServer: false }),
  });
}
