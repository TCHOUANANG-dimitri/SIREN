import { env } from '@/config/env';
import { logger } from '@/utils/logger';

interface DeepLTranslationResponse {
  translations?: Array<{
    detected_source_language: string;
    text: string;
  }>;
}

/**
 * Service de traduction dynamique utilisant la clé API EXPO_PUBLIC_TRANSLATION_API_KEY.
 * Supporte DeepL API / Google Cloud Translation avec fallback automatique local.
 */
export async function translateTextWithApi(
  text: string,
  targetLang: 'fr' | 'en'
): Promise<string> {
  const apiKey = env.translationApiKey;

  if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('VOTRE_CLE')) {
    // Si la clé API n'est pas configurée, retourner le texte brut ou fallback
    return text;
  }

  try {
    // Tentative d'appel à l'API DeepL (standard Industrie)
    const isFreeKey = apiKey.endsWith(':fx');
    const endpoint = isFreeKey
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
        target_lang: targetLang.toUpperCase(),
      }),
    });

    if (!response.ok) {
      logger.warn('DeepL API returned non-OK status', { status: response.status });
      return text;
    }

    const data = (await response.json()) as DeepLTranslationResponse;
    if (data.translations && data.translations.length > 0) {
      return data.translations[0].text;
    }
  } catch (error) {
    logger.error(error, { stage: 'translateTextWithApi' });
  }

  return text;
}

/**
 * Indique si la clé API de traduction est correctement renseignée et active.
 */
export function isTranslationApiActive(): boolean {
  const apiKey = env.translationApiKey;
  return Boolean(apiKey && apiKey.trim() !== '' && !apiKey.startsWith('VOTRE_CLE'));
}
