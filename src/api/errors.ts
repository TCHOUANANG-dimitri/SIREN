import i18n from '@/i18n';

/**
 * Erreur applicative unique, quelle que soit la source (mock, HTTP, validation).
 * `message` est toujours un texte présentable à l'utilisateur (traduit, sans
 * jargon) ; le détail technique reste dans `cause` pour la journalisation.
 */
export type ErrorCode =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'session_expired'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'server'
  | 'contract'
  | 'not_available'
  | 'config'
  | 'unknown';

/**
 * Motif métier précis renvoyé par le serveur (`detail.code`, voir
 * docs/contrats/api-app-serveur-v1.md §Erreurs) ou détecté localement.
 * Chaque motif connu a un message `apiErrors.reasons.<motif>` en FR et EN.
 */
export type ErrorReason =
  | 'self_invite'
  | 'invitee_not_found'
  | 'already_shared'
  | 'secondary_limit'
  | 'identifier_invalid'
  | 'invitation_invalid'
  | 'rights_owner_only'
  | 'otp_invalid'
  | 'otp_expired'
  | 'otp_attempts_exceeded'
  | 'otp_rate_limited'
  | 'email_unavailable'
  | 'email_failed'
  | 'challenge_invalid'
  | 'reset_token_invalid'
  | 'password_incorrect'
  | 'password_weak'
  | 'email_taken'
  | 'invalid_credentials'
  | 'place_limit'
  | 'geofence_limit'
  | 'schedule_invalid';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly cause?: unknown;
  readonly reason?: ErrorReason | string;

  constructor(message: string, status = 400, code?: ErrorCode, cause?: unknown, reason?: ErrorReason | string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? codeFromStatus(status);
    this.cause = cause;
    this.reason = reason;
  }

  /** Une nouvelle tentative peut-elle réussir sans action de l'utilisateur ? */
  get isRetryable(): boolean {
    return this.code === 'network' || this.code === 'timeout' || this.code === 'server' || this.code === 'rate_limited';
  }
}

export function codeFromStatus(status: number): ErrorCode {
  if (status === 0) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408) return 'timeout';
  if (status === 409) return 'conflict';
  if (status === 422 || status === 400) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status === 501) return 'not_available';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Message utilisateur par défaut pour un code d'erreur (FR/EN via i18n). */
export function userMessageFor(code: ErrorCode): string {
  return i18n.t(`apiErrors.${code}`);
}

/** Message traduit d'un motif métier, ou null si le motif est inconnu de l'app. */
export function reasonMessage(reason: string | undefined, vars?: Record<string, unknown>): string | null {
  if (!reason || !/^[a-z_]+$/.test(reason)) return null;
  const key = `apiErrors.reasons.${reason}`;
  return i18n.exists(key) ? i18n.t(key, vars) : null;
}

/** Erreur métier détectée localement (même message que si le serveur l'avait refusée). */
export function reasonError(reason: ErrorReason, status: number, vars?: Record<string, unknown>): ApiError {
  return new ApiError(reasonMessage(reason, vars) ?? userMessageFor(codeFromStatus(status)), status, undefined, undefined, reason);
}

/** Fonction non encore exposée par le serveur : erreur explicite, jamais de repli silencieux sur le mock. */
export function notAvailable(feature: string): ApiError {
  return new ApiError(userMessageFor('not_available'), 501, 'not_available', new Error(`Live API missing: ${feature}`));
}

/** Convertit n'importe quelle erreur en texte présentable. */
export function toUserMessage(error: unknown, fallback?: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback ?? userMessageFor('unknown');
}
