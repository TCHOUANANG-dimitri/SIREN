import { useColorScheme, StyleSheet } from 'react-native';
import { usePreferencesStore, type ThemePreference } from '@/stores/preferencesStore';
import { darkColors, lightColors, type Palette } from './tokens';

export type ColorScheme = 'light' | 'dark';

export const palettes: Record<ColorScheme, Palette> = { light: lightColors, dark: darkColors };

/** Schéma effectif : la préférence explicite l'emporte sur le réglage du téléphone. */
export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export function useColorSchemeResolved(): ColorScheme {
  const preference = usePreferencesStore((s) => s.theme);
  const system = useColorScheme();
  return resolveScheme(preference, system);
}

/** Palette courante ; les composants la lisent au rendu (jamais au chargement du module). */
export function useTheme(): { colors: Palette; scheme: ColorScheme } {
  const scheme = useColorSchemeResolved();
  return { colors: palettes[scheme], scheme };
}

/**
 * Feuille de styles dépendant de la palette, créée une seule fois par schéma
 * (pas de StyleSheet.create à chaque rendu).
 *
 *   const useStyles = makeStyles((colors) => ({ title: { color: colors.ink } }));
 *   function Screen() { const styles = useStyles(); … }
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: Palette) => T & StyleSheet.NamedStyles<any>
): () => T {
  const cache: Partial<Record<ColorScheme, T>> = {};
  return function useStyles() {
    const scheme = useColorSchemeResolved();
    return (cache[scheme] ??= StyleSheet.create(factory(palettes[scheme])));
  };
}
