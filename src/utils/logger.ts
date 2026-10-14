/**
 * Journalisation — CDC App §7/§8 : aucun crash silencieux, aucune donnée
 * sensible d'enfant dans les journaux.
 *
 * Toute donnée de contexte passe par `redact` : jetons, mots de passe,
 * coordonnées précises, téléphones, emails et contenus libres sont masqués
 * avant d'atteindre la console ou un service distant (Sentry…).
 */
type LogContext = Record<string, unknown>;
type Level = 'info' | 'warn' | 'error';

/** Récepteur externe (ex. Sentry) branché au démarrage si configuré. */
export interface LogSink {
  log(level: Level, message: string, context?: LogContext): void;
  captureException(error: unknown, context?: LogContext): void;
  event(name: BusinessEvent, context?: LogContext): void;
}

const SENSITIVE_KEY = /token|password|secret|authorization|cookie|key|otp|code|lat|lon|lng|latitude|longitude|telephone|phone|email|description|reason|prenom|nom|photo/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE = /\+?\d[\d\s.-]{7,}\d/g;
const BEARER = /Bearer\s+[A-Za-z0-9._-]+/g;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function scrubString(value: string): string {
  return value.replace(BEARER, 'Bearer [masqué]').replace(JWT, '[jwt]').replace(EMAIL, '[email]').replace(PHONE, '[tel]');
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[…]';
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[masqué]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

let sink: LogSink | null = null;

export function setLogSink(next: LogSink | null) {
  sink = next;
}

function format(message: string, context?: LogContext) {
  return context ? `${message} ${JSON.stringify(context)}` : message;
}

export const logger = {
  info(message: string, context?: LogContext) {
    const safe = context ? (redact(context) as LogContext) : undefined;
    if (__DEV__) console.log(`[SIREN] ${format(message, safe)}`);
    sink?.log('info', message, safe);
  },
  warn(message: string, context?: LogContext) {
    const safe = context ? (redact(context) as LogContext) : undefined;
    console.warn(`[SIREN] ${format(message, safe)}`);
    sink?.log('warn', message, safe);
  },
  error(error: unknown, context?: LogContext) {
    const safe = context ? (redact(context) as LogContext) : undefined;
    const message = scrubString(error instanceof Error ? error.message : String(error));
    console.error(`[SIREN] ${format(message, safe)}`);
    sink?.captureException(error, safe);
  },
};

/** Événements métier (CDC observabilité) — jamais de position ni d'identité en contexte. */
export type BusinessEvent =
  | 'login_success'
  | 'device_paired'
  | 'location_received'
  | 'alert_received'
  | 'emergency_opened'
  | 'emergency_confirmed'
  | 'credit_purchased'
  | 'payment_verified'
  | 'app_offline'
  | 'websocket_reconnect';

export function trackEvent(name: BusinessEvent, context?: LogContext) {
  const safe = context ? (redact(context) as LogContext) : undefined;
  if (__DEV__) console.log(`[SIREN:event] ${format(name, safe)}`);
  sink?.event(name, safe);
}
