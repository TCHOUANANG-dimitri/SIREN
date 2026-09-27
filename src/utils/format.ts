import i18n from '@/i18n';

/** Locale d'affichage alignée sur la langue de l'interface (FR par défaut). */
function locale(): string {
  return i18n.language === 'en' ? 'en-GB' : 'fr-FR';
}

function isValid(date: Date) {
  return !Number.isNaN(date.getTime());
}

/** Âge relatif d'un horodatage ISO (UTC) — affiché dans le fuseau du téléphone. */
export function formatRelativeTime(isoTimestamp: string | null | undefined, now: number = Date.now()): string {
  if (!isoTimestamp) return i18n.t('time.unknown');
  const date = new Date(isoTimestamp);
  if (!isValid(date)) return i18n.t('time.unknown');
  const diffSec = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (diffSec < 10) return i18n.t('time.justNow');
  if (diffSec < 60) return i18n.t('time.secondsAgo', { count: diffSec });
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return i18n.t('time.minutesAgo', { count: diffMin });
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return i18n.t('time.hoursAgo', { count: diffH });
  return i18n.t('time.daysAgo', { count: Math.round(diffH / 24) });
}

export function formatClock(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return '—';
  const date = new Date(isoTimestamp);
  if (!isValid(date)) return '—';
  return date.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return '—';
  const date = new Date(isoTimestamp);
  if (!isValid(date)) return '—';
  return date.toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatDistanceM(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} km`;
}

/** Vitesse en km/h ; « — » si le dispositif ne l'a pas transmise (jamais 0 par défaut). */
export function formatSpeedKmh(speed: number | null | undefined): string {
  if (speed == null || !Number.isFinite(speed)) return '—';
  return `${Math.round(speed)} km/h`;
}

export function formatBattery(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent)) return '—';
  return `${Math.round(percent)} %`;
}
