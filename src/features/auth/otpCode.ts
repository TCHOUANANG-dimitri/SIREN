/**
 * Code à usage unique : 6 caractères alphanumériques au plus (serveur :
 * app/services/otp.py). Saisie tolérante : minuscules acceptées, espaces et
 * tirets ignorés ; les caractères ambigus ne sont jamais émis par le serveur.
 */
export const OTP_CODE_LENGTH = 6;

export function normalizeOtpInput(raw: string, length = OTP_CODE_LENGTH): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, length);
}

export function isCompleteOtp(code: string, length = OTP_CODE_LENGTH): boolean {
  return new RegExp(`^[A-Z0-9]{${length}}$`).test(code);
}
