import { getDb, mutateDb } from '../db';
import { ApiError } from '../../errors';
import { simulateLatency } from '../helpers';
import { assertChildAccess, assertPrincipal, resolveCurrentUser } from '../session';
import type { DeviceStatus } from '@/models/entities';
import i18n from '@/i18n';

export async function getDeviceSettings(token: string | null, childId: string): Promise<DeviceStatus> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  const db = getDb();
  const child = db.children.find((c) => c.id === childId);
  const device = db.devices.find((d) => d.deviceId === child?.deviceId);
  if (!device) throw new ApiError(i18n.t('errors.deviceMissing'), 404);
  return device;
}

export async function patchDeviceSettings(
  token: string | null,
  childId: string,
  patch: Partial<Pick<DeviceStatus, 'energyMode' | 'sensitivity'>>
): Promise<DeviceStatus> {
  await simulateLatency(400, 900);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  assertPrincipal(user); // "Régler le dispositif" réservé au principal — CDC §7.2
  const db = getDb();
  const child = db.children.find((c) => c.id === childId);
  const device = db.devices.find((d) => d.deviceId === child?.deviceId);
  if (!device) throw new ApiError(i18n.t('errors.deviceMissing'), 404);
  mutateDb((d) => {
    const target = d.devices.find((dev) => dev.deviceId === device.deviceId);
    if (target) {
      Object.assign(target, patch);
      target.configVersion += 1;
      target.lastSeen = new Date().toISOString();
    }
  });
  return { ...device, ...patch };
}

const relayed = new Set<string>();

/**
 * Relais simulé (mêmes règles que POST /device/v1/relay) : 12 champs, compte
 * autorisé sur l'enfant associé au traceur, une trame déjà relayée est un doublon.
 * La position est ajoutée à l'historique de l'enfant (aucune valeur inventée).
 */
export async function relayFrames(token: string | null, frames: string[]) {
  await simulateLatency(150, 400);
  const user = resolveCurrentUser(token);
  return frames.map((frame) => {
    const fields = frame.trim().split(';');
    if (fields.length !== 12) return { status: 'rejected' as const, reason: 'field_count' };
    const [id, lat, lon, bat, spd, ts] = fields;
    const latN = Number(lat);
    const lonN = Number(lon);
    if (!Number.isFinite(latN) || latN < -90 || latN > 90) return { status: 'rejected' as const, reason: 'lat_invalid' };
    if (!Number.isFinite(lonN) || lonN < -180 || lonN > 180) return { status: 'rejected' as const, reason: 'lon_invalid' };
    if (Number.isNaN(Date.parse(ts)) || !/(Z|[+-]\d{2}:\d{2})$/.test(ts)) return { status: 'rejected' as const, reason: 'ts_invalid' };
    const child = getDb().children.find((c) => c.deviceId === id);
    if (!child) return { status: 'forbidden' as const };
    try {
      assertChildAccess(child.id, user);
    } catch {
      return { status: 'forbidden' as const };
    }
    const key = frame.trim();
    if (relayed.has(key)) return { status: 'duplicate' as const };
    relayed.add(key);
    mutateDb((d) => {
      (d.positions[child.id] ??= []).push({
        lat: latN,
        lon: lonN,
        speedKmh: spd === '' ? null : Number(spd),
        timestamp: new Date(ts).toISOString(),
        accuracyM: null,
        fixQuality: 'estimee',
        battery: bat === '' ? null : Number(bat),
      });
    });
    return { status: 'accepted' as const };
  });
}
