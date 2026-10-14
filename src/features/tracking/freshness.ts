import { TRACKING_POLICY } from '@/config/business';
import type { DeviceStatus, Position } from '@/models/entities';

/**
 * Fiabilité perçue d'une position (bandeau carte — CDC App §4.3).
 *
 * L'âge est calculé à partir de l'horodatage du DISPOSITIF (jamais l'heure de
 * réception) comparé à l'horloge du téléphone ; un horodatage dans le futur
 * (dérive d'horloge) est traité comme âge nul, sans être considéré « récent »
 * si le serveur l'a lui-même qualifié d'estimé ou perdu.
 */
export type Freshness = 'recent' | 'estimated' | 'lost' | 'device_offline' | 'none';

export interface FreshnessInfo {
  freshness: Freshness;
  /** Âge en minutes, null si inconnu. */
  ageMinutes: number | null;
}

export function positionFreshness(
  position: Position | null | undefined,
  device: Pick<DeviceStatus, 'online'> | null | undefined,
  now: number = Date.now(),
  policy = TRACKING_POLICY
): FreshnessInfo {
  if (!position) return { freshness: device && !device.online ? 'device_offline' : 'none', ageMinutes: null };

  const ts = new Date(position.timestamp).getTime();
  const ageMinutes = Number.isFinite(ts) ? Math.max(0, (now - ts) / 60_000) : null;

  if (ageMinutes === null) return { freshness: 'estimated', ageMinutes: null };
  if (position.fixQuality === 'perdu' || ageMinutes > policy.lostAfterMinutes) {
    return { freshness: device && !device.online ? 'device_offline' : 'lost', ageMinutes };
  }
  const imprecise = position.accuracyM !== null && position.accuracyM > policy.maxAccurateRadiusM;
  if (position.fixQuality === 'estimee' || imprecise || ageMinutes > policy.recentMaxAgeMinutes) {
    return { freshness: 'estimated', ageMinutes };
  }
  return { freshness: 'recent', ageMinutes };
}
