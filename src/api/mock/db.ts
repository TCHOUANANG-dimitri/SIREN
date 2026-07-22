import { storage } from '@/utils/storage';
import type {
  AccessAuditEntry,
  Alert,
  AudioActivationLog,
  Child,
  CommunityReport,
  DeviceStatus,
  EmergencyContact,
  Geofence,
  Place,
  Position,
  RiskScore,
  SearchZone,
  SecondaryAccess,
  User,
} from '@/models/entities';

export interface DbShape {
  users: User[];
  children: Child[];
  devices: DeviceStatus[];
  positions: Record<string, Position[]>;
  places: Place[];
  geofences: Geofence[];
  riskScores: Record<string, RiskScore>;
  riskHistory: Record<string, RiskScore[]>;
  alerts: Alert[];
  secondaryAccess: SecondaryAccess[];
  accessAudit: AccessAuditEntry[];
  communityReports: CommunityReport[];
  emergencyContacts: EmergencyContact[];
  audioLogs: AudioActivationLog[];
  searchZones: Record<string, SearchZone>;
  passwordsByEmail: Record<string, string>;
}

const STORAGE_KEY = 'siren.mockDb.v1';

let state: DbShape | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (state) void storage.setItem(STORAGE_KEY, state);
  }, 300);
}

export async function initDb(seedFactory: () => DbShape, force = false): Promise<DbShape> {
  if (!force) {
    const persisted = await storage.getItem<DbShape>(STORAGE_KEY);
    if (persisted) {
      state = persisted;
      return state;
    }
  }
  state = seedFactory();
  scheduleSave();
  return state;
}

export function getDb(): DbShape {
  if (!state) {
    throw new Error('Mock DB not initialised — call initDb() before use.');
  }
  return state;
}

export function mutateDb<T>(fn: (db: DbShape) => T): T {
  const db = getDb();
  const result = fn(db);
  scheduleSave();
  return result;
}

export async function resetDb(seedFactory: () => DbShape): Promise<DbShape> {
  return initDb(seedFactory, true);
}

export function genId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
