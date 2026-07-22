import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Abstraction de stockage local (cache offline, préférences, base mock).
 * Utilise AsyncStorage (compatible Expo Go). Un swap vers MMKV/expo-sqlite/kv-store
 * plus tard ne touche que ce fichier.
 */
export const storage = {
  async getItem<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async setItem<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
  async clearAll(keys: string[]): Promise<void> {
    await AsyncStorage.multiRemove(keys);
  },
};
