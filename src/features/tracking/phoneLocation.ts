/**
 * État de la position du TÉLÉPHONE (jamais celle du dispositif, qui vient du serveur).
 *
 * - unknown      : pas encore demandé — rien n'est demandé sans action explicite ;
 * - granted      : autorisé et localisation active ;
 * - denied       : refusé, peut être redemandé ;
 * - blocked      : refusé définitivement (« ne plus demander ») → seuls les réglages du téléphone ;
 * - services_off : autorisé mais localisation du téléphone désactivée.
 */
export type PhoneLocationPermission = 'unknown' | 'granted' | 'denied' | 'blocked' | 'services_off';

export interface PermissionSnapshot {
  status: 'granted' | 'denied' | 'undetermined' | string;
  canAskAgain: boolean;
}

export function permissionStateFrom(permission: PermissionSnapshot, servicesEnabled: boolean): PhoneLocationPermission {
  if (permission.status === 'granted') return servicesEnabled ? 'granted' : 'services_off';
  if (permission.status === 'undetermined') return 'unknown';
  return permission.canAskAgain ? 'denied' : 'blocked';
}

/** Au-delà, le point du téléphone est affiché comme ancien (jamais comme « position actuelle »). */
export const PHONE_FIX_MAX_AGE_MS = 2 * 60_000;

export function isPhoneFixStale(fixTimestamp: number, now = Date.now()): boolean {
  return now - fixTimestamp > PHONE_FIX_MAX_AGE_MS;
}
