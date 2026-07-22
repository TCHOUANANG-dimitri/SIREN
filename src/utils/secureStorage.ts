import * as SecureStore from 'expo-secure-store';

/**
 * Jetons d'authentification — CDC1 §7.1 : jamais en clair, jamais dans le code.
 * expo-secure-store chiffre via Keychain (iOS) / Keystore (Android).
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};

export const SECURE_KEYS = {
  accessToken: 'siren.accessToken',
  refreshToken: 'siren.refreshToken',
} as const;
