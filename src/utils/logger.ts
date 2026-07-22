/**
 * Abstraction de journalisation — CDC1 §13.5 "aucun crash silencieux". Un point d'accroche
 * unique pour brancher Sentry (ou équivalent) plus tard sans toucher aux appelants.
 */
type LogContext = Record<string, unknown>;

function format(message: string, context?: LogContext) {
  return context ? `${message} ${JSON.stringify(context)}` : message;
}

export const logger = {
  info(message: string, context?: LogContext) {
    if (__DEV__) console.log(`[SIREN] ${format(message, context)}`);
  },
  warn(message: string, context?: LogContext) {
    console.warn(`[SIREN] ${format(message, context)}`);
  },
  error(error: unknown, context?: LogContext) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SIREN] ${format(message, context)}`, error);
  },
};
