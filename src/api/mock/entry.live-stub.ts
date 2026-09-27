/**
 * Remplace `entry.ts` dans les builds live (metro.config.js). Tout appel est
 * une erreur de configuration : le mode mock n'est pas disponible dans ce binaire.
 */
function unavailable(): never {
  throw new Error('Backend simulé absent de ce build (EXPO_PUBLIC_API_MODE=live).');
}

export const mockApi = new Proxy({}, { get: unavailable }) as never;
export const initMockBackend = async (): Promise<void> => unavailable();
export const resetMockBackend = async (): Promise<void> => unavailable();
export const createMockChannel = unavailable;
export const simulateMockDisconnect = unavailable;
