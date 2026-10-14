import { z } from 'zod';

/**
 * Politique de mot de passe — CDC App §4.1 : 10 caractères minimum, avec
 * majuscule, chiffre et symbole. Appliquée aussi par le serveur
 * (server/app/schemas/auth.py) : le client n'est jamais la seule barrière.
 * Les messages sont des clés i18n, traduites à l'affichage.
 */
export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'validation.passwordLength')
  .max(128, 'validation.passwordTooLong')
  .regex(/[a-z]/, 'validation.passwordLower')
  .regex(/[A-Z]/, 'validation.passwordUpper')
  .regex(/[0-9]/, 'validation.passwordDigit')
  .regex(/[^A-Za-z0-9]/, 'validation.passwordSymbol');

/** Nombre de critères satisfaits (0..5) pour la jauge de robustesse. */
export function passwordScore(password: string): number {
  return [
    password.length >= PASSWORD_MIN_LENGTH,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
}
