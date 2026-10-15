import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { env, API_VERSION } from '@/config/env';

/**
 * Informations de version affichées dans Réglages / À propos, lues dans la
 * configuration de build (app.config.ts). Aucune valeur n'est inventée : un
 * champ absent de la build n'est pas affiché.
 */
export function appVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

/** Numéro de build natif s'il est déclaré (android.versionCode / ios.buildNumber). */
export function appBuild(): string | null {
  const config = Constants.expoConfig;
  const build = Platform.OS === 'android' ? config?.android?.versionCode : config?.ios?.buildNumber;
  return build != null ? String(build) : null;
}

export function appVersionLabel(): string {
  const version = appVersion();
  const build = appBuild();
  if (!version) return '';
  return build ? `${version} (${build})` : version;
}

export function appName(): string {
  return Constants.expoConfig?.name ?? 'SIREN';
}

export const technicalInfo = () => ({
  environment: env.appEnv,
  apiMode: env.apiMode,
  apiContract: API_VERSION,
  platform: `${Platform.OS} ${String(Platform.Version)}`,
});
