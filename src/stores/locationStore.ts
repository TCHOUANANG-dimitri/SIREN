import { create } from 'zustand';
import * as Location from 'expo-location';
import { logger } from '@/utils/logger';

interface LocationState {
  latitude: number;
  longitude: number;
  permissionGranted: boolean | null; // null = not yet requested
  initialized: boolean;
  /** Request foreground permission, then get current coords. Call once at app start. */
  initialize: () => Promise<void>;
}

const FALLBACK = { latitude: 3.848, longitude: 11.5021 }; // Yaoundé

export const useLocationStore = create<LocationState>((set, get) => ({
  ...FALLBACK,
  permissionGranted: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      set({ permissionGranted: granted });

      if (granted) {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        set({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      }
    } catch (error) {
      logger.error(error, { stage: 'locationStore.initialize' });
    } finally {
      set({ initialized: true });
    }
  },
}));
