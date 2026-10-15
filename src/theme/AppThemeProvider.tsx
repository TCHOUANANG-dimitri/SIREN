import { useEffect, useMemo, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from './theme';

/**
 * Applique le thème effectif à tout ce qui n'est pas un composant SIREN :
 * navigation (fonds des piles et onglets), barre d'état, fond natif de la
 * fenêtre, et composants système (sélecteurs de date, boîtes de dialogue).
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { colors, scheme } = useTheme();
  const preference = usePreferencesStore((s) => s.theme);

  useEffect(() => {
    // « Système » rend la main au réglage du téléphone ; sinon on force le schéma
    // pour que les composants natifs (DateTimePicker, Alert) suivent l'app.
    Appearance.setColorScheme(preference === 'system' ? null : preference);
  }, [preference]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.surface).catch(() => {});
  }, [colors.surface]);

  const navigationTheme = useMemo<Theme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.surface,
        card: colors.card,
        text: colors.ink,
        border: colors.border,
        notification: colors.urgenceFill,
      },
    };
  }, [scheme, colors]);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}
