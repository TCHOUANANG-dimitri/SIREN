/**
 * Numéro de série du dispositif : `SIREN-XXXXX-XXXXX` (X alphanumérique ASCII).
 *
 * SENSIBLE À LA CASSE : aucune conversion majuscule/minuscule n'est faite —
 * « SIREN-ab12C-… » et « SIREN-AB12C-… » désignent deux boîtiers différents
 * (serveur : app/core/serial.py, contrainte ck_devices_serial_format).
 *
 * Saisie manuelle : l'utilisateur ne tape que les 10 caractères ; « SIREN- » et
 * le tiret après le 5e caractère sont affichés automatiquement.
 * QR code : le contenu est une DONNÉE, jamais une adresse à ouvrir.
 */
export const SERIAL_PREFIX = 'SIREN-';
export const SERIAL_BODY_LENGTH = 10;
const SERIAL_RE = /^SIREN-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;
const BODY_CHAR = /[A-Za-z0-9]/;

export function isValidSerial(value: string): boolean {
  return SERIAL_RE.test(value);
}

/** Contenu d'un QR : uniquement le numéro exact (espaces de bord tolérés), sinon null. */
export function parseQrPayload(data: unknown): string | null {
  if (typeof data !== 'string' || data.length > 64) return null;
  const value = data.trim();
  return isValidSerial(value) ? value : null;
}

export interface SerialBodyResult {
  /** Jusqu'à 10 caractères alphanumériques, casse conservée. */
  body: string;
  /** Vrai si des caractères non autorisés ont été ignorés (accents, symboles…). */
  rejected: boolean;
}

/**
 * Extrait les caractères utiles d'une saisie ou d'un collage : retire le préfixe
 * « SIREN- » s'il est collé, les tirets et espaces, ignore le reste.
 */
export function sanitizeSerialBody(raw: string): SerialBodyResult {
  let text = raw.trim();
  if (text.startsWith(SERIAL_PREFIX)) text = text.slice(SERIAL_PREFIX.length);
  let body = '';
  let rejected = false;
  for (const ch of text) {
    if (BODY_CHAR.test(ch)) {
      if (body.length < SERIAL_BODY_LENGTH) body += ch;
    } else if (ch !== '-' && ch !== ' ') {
      rejected = true;
    }
  }
  return { body, rejected };
}

/** Partie éditable affichée : « AB12C-XY9Z0 » (tiret ajouté après le 5e caractère). */
export function formatSerialBody(body: string): string {
  return body.length > 5 ? `${body.slice(0, 5)}-${body.slice(5)}` : body;
}

export function serialFromBody(body: string): string | null {
  return body.length === SERIAL_BODY_LENGTH ? `${SERIAL_PREFIX}${body.slice(0, 5)}-${body.slice(5)}` : null;
}

/** Position du curseur dans le texte formaté pour un index dans `body` (après le tiret au-delà du 5e). */
function formattedIndex(bodyIndex: number): number {
  return bodyIndex > 5 ? bodyIndex + 1 : bodyIndex;
}

/**
 * Nouvel état après une modification du champ, curseur compris : on estime la
 * position du curseur dans le texte brut (édition unique au curseur), on compte
 * les caractères utiles qui la précèdent, puis on la reporte dans le texte
 * reformaté — le curseur ne saute pas en fin de champ lors d'une édition au milieu.
 */
export function nextSerialInput(
  previousFormatted: string,
  rawText: string,
  previousCursor: number
): SerialBodyResult & { formatted: string; cursor: number } {
  const { body, rejected } = sanitizeSerialBody(rawText);
  const formatted = formatSerialBody(body);
  const pasted = rawText.trim().startsWith(SERIAL_PREFIX);
  const rawCursor = pasted ? rawText.length : Math.max(0, Math.min(rawText.length, previousCursor + (rawText.length - previousFormatted.length)));
  let useful = 0;
  for (const ch of rawText.slice(0, rawCursor)) if (BODY_CHAR.test(ch)) useful += 1;
  const bodyIndex = Math.min(useful, body.length);
  return { body, rejected, formatted, cursor: Math.min(formattedIndex(bodyIndex), formatted.length) };
}
