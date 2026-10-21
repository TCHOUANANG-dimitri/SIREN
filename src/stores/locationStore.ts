import { create } from 'zustand';
import * as Location from 'expo-location';
import { logger } from '@/utils/logger';
import { permissionStateFrom, type PhoneLocationPermission } from '@/features/tracking/phoneLocation';

export interface PhoneFix {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  /** ms epoch du relevé. */
  timestamp: number;
}

interface LocationState {
  /** Centre de carte par défaut (repli Yaoundé tant qu'aucun relevé réel). */
  latitude: number;
  longitude: number;
  /** Compatibilité : vrai si l'autorisation est accordée. */
  permissionGranted: boolean | null;
  permission: PhoneLocationPermission;
  /** Vrai seulement si latitude/longitude viennent d'un vrai relevé (et non du repli). */
  hasFix: boolean;
  fix: PhoneFix | null;
  /** Dernier échec de relevé (délai, matériel) ; null si aucun. */
  error: 'unavailable' | null;
  initialized: boolean;
  /** Démarrage : lit l'état SANS jamais afficher la demande d'autorisation. */
  initialize: () => Promise<void>;
  /** Action explicite de l'utilisateur : demande l'autorisation si possible, puis relève la position. */
  request: () => Promise<void>;
  /** Nouveau relevé si l'autorisation est accordée (ex. retour des réglages). */
  refresh: () => Promise<void>;
}

const FALLBACK = { latitude: 3.848, longitude: 11.5021 }; // Yaoundé

async function readPermission(): Promise<PhoneLocationPermission> {
  const permission = await Location.getForegroundPermissionsAsync();
  const services = permission.status === 'granted' ? await Location.hasServicesEnabledAsync() : true;
  return permissionStateFrom(permission, services);
}

export const useLocationStore = create<LocationState>((set, get) => ({
  ...FALLBACK,
  permissionGranted: null,
  permission: 'unknown',
  hasFix: false,
  fix: null,
  error: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    try {
      await get().refresh();
    } finally {
      set({ initialized: true });
    }
  },

  request: async () => {
    try {
      let permission = await readPermission();
      if (permission === 'unknown' || permission === 'denied') {
        const asked = await Location.requestForegroundPermissionsAsync();
        const services = asked.status === 'granted' ? await Location.hasServicesEnabledAsync() : true;
        permission = permissionStateFrom(asked, services);
      }
      set({ permission, permissionGranted: permission === 'granted' || permission === 'services_off' });
      if (permission === 'granted') await locate(set);
    } catch (error) {
      logger.error(error, { stage: 'locationStore.request' });
      set({ error: 'unavailable' });
    }
  },

  refresh: async () => {
    try {
      const permission = await readPermission();
      set({ permission, permissionGranted: permission === 'unknown' ? null : permission === 'granted' || permission === 'services_off' });
      if (permission === 'granted') await locate(set);
    } catch (error) {
      logger.error(error, { stage: 'locationStore.refresh' });
      set({ error: 'unavailable' });
    }
  },
}));

async function locate(set: (partial: Partial<LocationState>) => void) {
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    set({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      hasFix: true,
      fix: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy ?? null,
        timestamp: position.timestamp,
      },
      error: null,
    });
  } catch (error) {
    // Pas de position inventée : l'ancien relevé (s'il existe) reste affiché comme ancien.
    logger.warn('Position du téléphone indisponible', { error: String(error) });
    set({ error: 'unavailable' });
  }
}
