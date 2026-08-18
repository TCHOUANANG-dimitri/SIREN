import Constants from 'expo-constants';
import { z } from 'zod';

const envSchema = z.object({
  apiMode: z.enum(['mock', 'live']).default('mock'),
  apiBaseUrl: z.string().default('http://localhost:8000'),
  wsUrl: z.string().default('ws://localhost:8000/ws'),
  mapsApiKey: z.string().optional(),
  translationApiKey: z.string().optional(),
});

const raw = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

export const env = envSchema.parse({
  apiMode: raw.apiMode ?? process.env.EXPO_PUBLIC_API_MODE,
  apiBaseUrl: raw.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL,
  wsUrl: raw.wsUrl ?? process.env.EXPO_PUBLIC_WS_URL,
  mapsApiKey: raw.mapsApiKey ?? process.env.EXPO_PUBLIC_MAPS_API_KEY,
  translationApiKey: raw.translationApiKey ?? process.env.EXPO_PUBLIC_TRANSLATION_API_KEY,
});
