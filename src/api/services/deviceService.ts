import { getDb, mutateDb } from '../mock/db';
import { ApiError, simulateLatency } from '../network';
import { assertChildAccess, assertPrincipal, resolveCurrentUser } from '../mock/session';
import type { DeviceStatus } from '@/models/entities';

export async function getDeviceSettings(token: string | null, childId: string): Promise<DeviceStatus> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  const db = getDb();
  const child = db.children.find((c) => c.id === childId);
  const device = db.devices.find((d) => d.deviceId === child?.deviceId);
  if (!device) throw new ApiError('Dispositif introuvable', 404);
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
  if (!device) throw new ApiError('Dispositif introuvable', 404);
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
