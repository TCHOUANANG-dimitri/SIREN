import Constants from 'expo-constants';
import { z } from 'zod';

/**
 * Configuration d'exécution, lue depuis `app.config.ts` (`extra`) puis validée.
 *
 * Règle : une variable facultative absente ou invalide dégrade proprement la
 * fonction concernée ; elle ne fait jamais planter l'application au démarrage.
 * Les problèmes détectés sont exposés dans `configIssues` pour être affichés
 * (écran de configuration) et journalisés.
 */

const DEFAULTS = {
  apiMode: 'mock',
  apiBaseUrl: 'http://localhost:8000',
  wsUrl: 'ws://localhost:8000/api/v1/ws',
  mapStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  appEnv: 'development',
} as const;

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && !value.startsWith('VOTRE_') ? value : undefined));

const flag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === 'true' || value === '1');

const rawSchema = z.object({
  appEnv: z.enum(['development', 'staging', 'production']).catch(DEFAULTS.appEnv),
  apiMode: z.enum(['mock', 'live']).catch(DEFAULTS.apiMode),
  apiBaseUrl: z.string().trim().url().catch(DEFAULTS.apiBaseUrl),
  // Vide = pas de WebSocket (ex. o2switch mutualisé / Passenger) : l'app passe en polling REST.
  wsUrl: z.union([z.literal(''), z.string().trim().url()]).catch(DEFAULTS.wsUrl),
  mapsApiKey: optionalString,
  mapStyleUrl: z.string().trim().url().catch(DEFAULTS.mapStyleUrl),
  translationApiKey: optionalString,
  fauconUrl: optionalString,
  sentryDsn: optionalString,
  featureWebsocket: flag,
  featureCredits: flag,
  featureAds: flag,
  featureAudio: flag,
  featureFaucon: flag,
});

export type AppEnvironment = z.infer<typeof rawSchema>['appEnv'];

export interface Env {
  appEnv: AppEnvironment;
  apiMode: 'mock' | 'live';
  apiBaseUrl: string;
  /** Chaîne vide si le temps réel est désactivé. */
  wsUrl: string;
  mapsApiKey?: string;
  mapStyleUrl: string;
  translationApiKey?: string;
  fauconUrl?: string;
  sentryDsn?: string;
}

export interface ConfigIssue {
  key: string;
  severity: 'error' | 'warning';
  message: string;
}

function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2' || host.endsWith('.local');
  } catch {
    return false;
  }
}

function readRawConfig(): Record<string, unknown> {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const pick = (key: string, envKey: string) => extra[key] ?? process.env[envKey];
  return {
    appEnv: pick('appEnv', 'EXPO_PUBLIC_APP_ENV'),
    apiMode: pick('apiMode', 'EXPO_PUBLIC_API_MODE'),
    apiBaseUrl: pick('apiBaseUrl', 'EXPO_PUBLIC_API_BASE_URL'),
    wsUrl: pick('wsUrl', 'EXPO_PUBLIC_WS_URL'),
    mapsApiKey: pick('mapsApiKey', 'EXPO_PUBLIC_MAPS_API_KEY'),
    mapStyleUrl: pick('mapStyleUrl', 'EXPO_PUBLIC_MAP_STYLE_URL'),
    translationApiKey: pick('translationApiKey', 'EXPO_PUBLIC_TRANSLATION_API_KEY'),
    fauconUrl: pick('fauconUrl', 'EXPO_PUBLIC_FAUCON_URL'),
    sentryDsn: pick('sentryDsn', 'EXPO_PUBLIC_SENTRY_DSN'),
    featureWebsocket: pick('featureWebsocket', 'EXPO_PUBLIC_FEATURE_WEBSOCKET'),
    featureCredits: pick('featureCredits', 'EXPO_PUBLIC_FEATURE_CREDITS'),
    featureAds: pick('featureAds', 'EXPO_PUBLIC_FEATURE_ADS'),
    featureAudio: pick('featureAudio', 'EXPO_PUBLIC_FEATURE_AUDIO'),
    featureFaucon: pick('featureFaucon', 'EXPO_PUBLIC_FEATURE_FAUCON'),
  };
}

/** Variable absente ou vide (`KEY=` dans .env) : la valeur par défaut s'applique. */
const isUnset = (value: unknown) => value === undefined || value === null || value === '';

export function buildConfig(raw: Record<string, unknown>) {
  const issues: ConfigIssue[] = [];
  const parsed = rawSchema.parse(raw);

  const env: Env = {
    appEnv: parsed.appEnv,
    apiMode: parsed.apiMode,
    apiBaseUrl: parsed.apiBaseUrl.replace(/\/+$/, ''),
    wsUrl: parsed.wsUrl,
    mapsApiKey: parsed.mapsApiKey,
    mapStyleUrl: parsed.mapStyleUrl,
    translationApiKey: parsed.translationApiKey,
    fauconUrl: parsed.fauconUrl,
    sentryDsn: parsed.sentryDsn,
  };

  if (!isUnset(raw.apiMode) && raw.apiMode !== env.apiMode) {
    issues.push({ key: 'EXPO_PUBLIC_API_MODE', severity: 'warning', message: `Valeur inconnue « ${String(raw.apiMode)} », mode mock utilisé.` });
  }

  if (env.apiMode === 'live') {
    if (isUnset(raw.apiBaseUrl)) {
      issues.push({ key: 'EXPO_PUBLIC_API_BASE_URL', severity: 'error', message: 'Obligatoire en mode live.' });
    }
    // Hors poste de développement, le transport doit être chiffré (CDC App §8 Sécurité).
    if (!isLocalHost(env.apiBaseUrl) && !env.apiBaseUrl.startsWith('https://')) {
      issues.push({ key: 'EXPO_PUBLIC_API_BASE_URL', severity: 'error', message: 'HTTPS obligatoire hors développement local.' });
    }
    if (env.wsUrl && !isLocalHost(env.wsUrl) && !env.wsUrl.startsWith('wss://')) {
      issues.push({ key: 'EXPO_PUBLIC_WS_URL', severity: 'error', message: 'WSS obligatoire hors développement local.' });
    }
  }

  // Une build de production ne doit jamais embarquer le backend simulé.
  if (env.appEnv === 'production' && env.apiMode === 'mock') {
    issues.push({ key: 'EXPO_PUBLIC_API_MODE', severity: 'error', message: 'Le mode mock est interdit en production.' });
  }

  const featureFlags = {
    /** Canal temps réel WebSocket (mode live uniquement). */
    websocket: env.apiMode === 'live' && !!env.wsUrl && (isUnset(raw.featureWebsocket) ? true : parsed.featureWebsocket),
    /** Crédits / paiement : pas de prestataire ni d'API serveur validés (CDC App §4.6). */
    credits: parsed.featureCredits,
    /** Publicité : désactivée tant que la politique « Familles » n'est pas validée. */
    ads: parsed.featureAds,
    /** Écoute audio : bloquée tant que le cadre juridique n'est pas validé (CDC App §4.4). */
    audio: parsed.featureAudio || env.apiMode === 'mock',
    /**
     * Passerelle WebView Faucon (tracking tiers transitoire, seule source GPS
     * réelle aujourd'hui) : active par défaut, désactivable par configuration.
     */
    faucon: (isUnset(raw.featureFaucon) ? true : parsed.featureFaucon) && !!env.fauconUrl,
  };

  return { env, featureFlags, issues };
}

const config = buildConfig(readRawConfig());

export const env: Env = config.env;
export const featureFlags = config.featureFlags;
export type FeatureFlag = keyof typeof featureFlags;
export const configIssues: readonly ConfigIssue[] = config.issues;

/** true si une erreur bloque le mode configuré (ex. live sans URL HTTPS). */
export const hasBlockingConfigError = configIssues.some((issue) => issue.severity === 'error');

/** Version du contrat REST attendue côté serveur (préfixe de route). */
export const API_VERSION = 'v1';
