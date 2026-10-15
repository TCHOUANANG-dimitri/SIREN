import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { logger } from '@/utils/logger';

/**
 * Préférences d'affichage propres à CE téléphone (non liées au compte) :
 * thème et langue choisis explicitement dans Réglages.
 *
 * Règle de priorité de la langue (documentée dans docs/I18N.md) :
 *   1. choix explicite fait dans SIREN sur ce téléphone (`language`) ;
 *   2. sinon, langue enregistrée sur le compte (`user.langue`, appliquée à la connexion) ;
 *   3. sinon, langue du téléphone (fr si elle n'est ni fr ni en).
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type AppLanguage = 'fr' | 'en';

export const THEME_PREF_KEY = 'siren.prefs.theme';
export const LANGUAGE_PREF_KEY = 'siren.prefs.language';
export const NOTIF_PREFS_KEY = 'siren.prefs.notifications';

/**
 * Préférences de notification appliquées PAR L'APPLICATION (affichage quand
 * l'app est ouverte, notifications de démonstration). Les urgences ne sont
 * jamais filtrées. L'envoi serveur selon ces préférences n'existe pas encore
 * (pas de route, voir docs/NOTIFICATIONS.md) : l'écran le dit explicitement.
 */
export interface NotificationPrefs {
  prealerte: boolean;
  information: boolean;
}

interface PreferencesState {
  theme: ThemePreference;
  /** null = pas de choix explicite sur ce téléphone. */
  language: AppLanguage | null;
  notifications: NotificationPrefs;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  setLanguage: (language: AppLanguage) => Promise<void>;
  setNotifications: (patch: Partial<NotificationPrefs>) => Promise<void>;
}

function isTheme(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isLanguage(value: unknown): value is AppLanguage {
  return value === 'fr' || value === 'en';
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  theme: 'system',
  language: null,
  notifications: { prealerte: true, information: true },
  hydrated: false,
  async hydrate() {
    try {
      const [theme, language, notifications] = await Promise.all([
        storage.getItem<unknown>(THEME_PREF_KEY),
        storage.getItem<unknown>(LANGUAGE_PREF_KEY),
        storage.getItem<Partial<NotificationPrefs & { info: boolean }>>(NOTIF_PREFS_KEY),
      ]);
      set({
        theme: isTheme(theme) ? theme : 'system',
        language: isLanguage(language) ? language : null,
        // `info` : ancien nom de `information` (réglages enregistrés avant la refonte).
        notifications: {
          prealerte: notifications?.prealerte !== false,
          information: (notifications?.information ?? notifications?.info) !== false,
        },
        hydrated: true,
      });
    } catch (error) {
      logger.warn('Préférences locales illisibles, valeurs par défaut', { errorCode: String(error) });
      set({ hydrated: true });
    }
  },
  async setTheme(theme) {
    set({ theme });
    await storage.setItem(THEME_PREF_KEY, theme);
  },
  async setLanguage(language) {
    set({ language });
    await storage.setItem(LANGUAGE_PREF_KEY, language);
  },
  async setNotifications(patch) {
    const notifications = { ...get().notifications, ...patch };
    set({ notifications });
    await storage.setItem(NOTIF_PREFS_KEY, notifications);
  },
}));
