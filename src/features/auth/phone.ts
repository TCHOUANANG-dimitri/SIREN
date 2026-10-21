/**
 * Saisie du numéro de téléphone (obligatoire, format international).
 *
 * Le serveur reste juge (bibliothèque phonenumbers, plan de numérotation réel) :
 * ici on normalise seulement la saisie vers E.164 sans supposer de longueur fixe
 * par pays — seule la borne E.164 (7 à 15 chiffres après l'indicatif) est vérifiée.
 */
export const DEFAULT_COUNTRY_CODE = '237';

const E164 = /^\+[1-9]\d{6,14}$/;

/** « 690 12 34 56 » → « +237690123456 » ; « 0033 6… » → « +336… » ; espaces, points, tirets tolérés. */
export function normalizePhoneInput(raw: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  const compact = raw.replace(/[\s.\-()/]/g, '');
  if (!compact) return '';
  if (compact.startsWith('+')) return `+${compact.slice(1).replace(/\D/g, '')}`;
  if (compact.startsWith('00')) return `+${compact.slice(2).replace(/\D/g, '')}`;
  const national = compact.replace(/\D/g, '');
  if (national.startsWith(countryCode) && national.length > countryCode.length + 6) return `+${national}`;
  return `+${countryCode}${national}`;
}

export function isPlausiblePhone(raw: string, countryCode = DEFAULT_COUNTRY_CODE): boolean {
  return E164.test(normalizePhoneInput(raw, countryCode));
}

/** Affichage discret d'un numéro (« +237 •••• 56 »). */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 6) return e164;
  return `+${digits.slice(0, 3)} •••• ${digits.slice(-2)}`;
}
