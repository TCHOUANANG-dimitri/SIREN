import { z } from 'zod';
import { RISK_THRESHOLDS } from '@/config/business';
import { ApiError, userMessageFor } from '../errors';
import type {
  AccessAuditEntry,
  Alert,
  AudioActivationLog,
  Child,
  CommunityReport,
  DeviceStatus,
  EmergencyContact,
  FixQuality,
  Geofence,
  Permission,
  Place,
  Position,
  RiskScore,
  RiskState,
  SearchZone,
  SecondaryAccess,
  User,
  ZoneState,
} from '@/models/entities';

/**
 * Contrat serveur → application, version 1.
 *
 * Source : routes FastAPI de `server/app/api/v1` (seul contrat existant à ce
 * jour). Chaque réponse est validée ici puis normalisée vers les entités de
 * `@/models/entities`. Règles :
 *  - champ supplémentaire → ignoré (compatibilité ascendante) ;
 *  - champ facultatif absent → `null`, jamais une valeur inventée ;
 *  - enum inconnue → valeur de repli prudente documentée ci-dessous ;
 *  - champ obligatoire absent / mauvais type → erreur `contract`.
 */
export const CONTRACT_VERSION = { api: 'v1', schema: 1 } as const;

const isoDate = z.string().min(1);
const nullableNumber = z.number().nullable().optional().transform((v) => v ?? null);
const nullableString = z.string().nullable().optional().transform((v) => v ?? null);
const lat = z.number().min(-90).max(90);
const lon = z.number().min(-180).max(180);

const FIX_QUALITIES: FixQuality[] = ['gps_recent', 'estimee', 'perdu'];
const RISK_STATES: RiskState[] = ['veille', 'prealerte', 'urgence', 'disparition'];
const PERMISSIONS: Permission[] = [
  'position_precise',
  'etat_zone',
  'alertes_prealerte',
  'alertes_urgence',
  'historique',
  'mobilisation',
];

/** Qualité inconnue → « estimée » : ne jamais présenter comme récent un point non qualifié. */
function toFixQuality(value: unknown): FixQuality {
  return FIX_QUALITIES.includes(value as FixQuality) ? (value as FixQuality) : 'estimee';
}

/** État inconnu → recalculé depuis le score avec les seuils en vigueur. */
export function stateForScore(score: number, thresholds = RISK_THRESHOLDS): RiskState {
  if (score >= thresholds.urgence) return 'urgence';
  if (score >= thresholds.prealerte) return 'prealerte';
  return 'veille';
}

function toRiskState(value: unknown, score: number): RiskState {
  return RISK_STATES.includes(value as RiskState) ? (value as RiskState) : stateForScore(score);
}

/** Permission inconnue → ignorée (moindre privilège). */
function toPermissions(values: unknown[]): Permission[] {
  return values.filter((p): p is Permission => PERMISSIONS.includes(p as Permission));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// --- Schémas ---------------------------------------------------------------

export const userSchema = z
  .object({
    id: z.string(),
    nom: z.string(),
    email: z.string(),
    telephone: nullableString,
    role: z.enum(['principal', 'secondaire']),
    langue: z.string().nullable().optional(),
    twofaEnabled: z.boolean().optional(),
    createdAt: isoDate,
  })
  .transform(
    (u): User => ({
      id: u.id,
      nom: u.nom,
      email: u.email,
      telephone: u.telephone ?? undefined,
      role: u.role,
      langue: u.langue === 'en' ? 'en' : 'fr',
      twofaEnabled: u.twofaEnabled ?? false,
      createdAt: u.createdAt,
    })
  );

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  twofaRequired: z.boolean().nullable().optional(),
});

export const refreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
});

const scheduleSchema = z.object({
  jours: z.array(z.number().int().min(0).max(6)),
  heureDebut: z.string(),
  heureFin: z.string(),
});

export const childSchema = z
  .object({
    id: z.string(),
    prenom: z.string(),
    deviceId: z.string().nullable().optional(),
    photoUrl: nullableString,
    parentId: z.string(),
    modelConfidence: z.number().nullable().optional(),
    createdAt: isoDate,
    sleepSchedule: scheduleSchema.nullable().optional(),
  })
  .transform(
    (c): Child => ({
      id: c.id,
      prenom: c.prenom,
      deviceId: c.deviceId ?? '',
      photoUrl: c.photoUrl ?? undefined,
      parentId: c.parentId,
      modelConfidence: clampScore(c.modelConfidence ?? 0),
      createdAt: c.createdAt,
      sleepSchedule: c.sleepSchedule ?? undefined,
    })
  );

const ENERGY_MODES = ['continu', 'equilibre', 'economie'] as const;

function toEnergyMode(value: unknown): DeviceStatus['energyMode'] {
  return ENERGY_MODES.includes(value as (typeof ENERGY_MODES)[number])
    ? (value as DeviceStatus['energyMode'])
    : null;
}

/** Le serveur stocke la sensibilité en texte ; seule une valeur 0..100 est reconnue. */
function toSensitivity(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
}

export const deviceStatusSchema = z
  .object({
    deviceId: z.string(),
    battery: nullableNumber,
    online: z.boolean(),
    lastSeen: nullableString,
    fixQuality: z.unknown(),
    configVersion: z.number().int(),
    firmwareVersion: nullableString,
    energyMode: z.unknown(),
    sensitivity: z.unknown(),
  })
  .transform(
    (d): DeviceStatus => ({
      deviceId: d.deviceId,
      battery: d.battery,
      online: d.online,
      lastSeen: d.lastSeen,
      fixQuality: toFixQuality(d.fixQuality),
      configVersion: d.configVersion,
      firmwareVersion: d.firmwareVersion,
      energyMode: toEnergyMode(d.energyMode),
      sensitivity: toSensitivity(d.sensitivity),
    })
  );

export const deviceSettingsSchema = z
  .object({ energyMode: z.unknown(), sensitivity: z.unknown(), configVersion: z.number().int() })
  .transform((d) => ({
    energyMode: toEnergyMode(d.energyMode),
    sensitivity: toSensitivity(d.sensitivity),
    configVersion: d.configVersion,
  }));

/** Réponse de GET /children/devices/{id} (appairage). */
export const deviceLookupSchema = z.object({
  deviceId: z.string(),
  online: z.boolean(),
  configVersion: z.number().int().optional(),
  firmwareVersion: nullableString,
  battery: nullableNumber,
});

export const positionSchema = z
  .object({
    lat,
    lon,
    speedKmh: nullableNumber,
    accuracyM: nullableNumber,
    heading: nullableNumber,
    fixQuality: z.unknown(),
    battery: nullableNumber,
    // v1 serveur : `ts` ; accepté aussi sous `timestamp` pour le mock et une future v2.
    ts: isoDate.optional(),
    timestamp: isoDate.optional(),
  })
  .refine((p) => !!(p.ts ?? p.timestamp), { message: 'horodatage manquant' })
  .transform(
    (p): Position => ({
      lat: p.lat,
      lon: p.lon,
      speedKmh: p.speedKmh,
      accuracyM: p.accuracyM,
      heading: p.heading,
      fixQuality: toFixQuality(p.fixQuality),
      battery: p.battery,
      timestamp: (p.ts ?? p.timestamp) as string,
    })
  );

export const zoneStateSchema = z
  .object({
    inSafeZone: z.boolean().optional(),
    inZone: z.boolean().optional(),
    zoneName: nullableString,
    asOf: nullableString,
  })
  .transform(
    (z0): ZoneState => ({
      inZone: z0.inZone ?? z0.zoneName !== null,
      zoneName: z0.zoneName,
      inForbiddenZone: z0.inSafeZone === false,
      asOf: z0.asOf,
    })
  );

const subScoresSchema = z
  .object({
    geo: z.number().optional(),
    mouvement: z.number().optional(),
    universel: z.number().optional(),
    declaratif: z.number().optional(),
  })
  .nullable()
  .optional()
  .transform((s) => ({
    geo: clampScore(s?.geo ?? 0),
    mouvement: clampScore(s?.mouvement ?? 0),
    universel: clampScore(s?.universel ?? 0),
    declaratif: clampScore(s?.declaratif ?? 0),
  }));

export const riskScoreSchema = z
  .object({
    childId: z.string(),
    score: z.number(),
    state: z.unknown(),
    confidence: z.number().nullable().optional(),
    reasons: z.array(z.string()).nullable().optional(),
    subScores: subScoresSchema,
    timestamp: nullableString,
  })
  .transform((r): RiskScore => {
    const score = clampScore(r.score);
    return {
      childId: r.childId,
      score,
      state: toRiskState(r.state, score),
      confidence: clampScore(r.confidence ?? 0),
      reasons: r.reasons ?? [],
      subScores: r.subScores,
      timestamp: r.timestamp,
    };
  });

export const riskHistorySchema = z
  .union([z.object({ scores: z.array(riskScoreSchema) }), z.array(riskScoreSchema)])
  .transform((h) => (Array.isArray(h) ? h : h.scores));

const ALERT_STATUSES = ['active', 'acquittee', 'fausse', 'resolue'] as const;

export const alertSchema = z
  .object({
    id: z.string(),
    childId: z.string(),
    level: z.unknown(),
    score: z.number(),
    reasons: z.array(z.string()).nullable().optional(),
    lat: lat.nullable().optional(),
    lon: lon.nullable().optional(),
    status: z.enum(ALERT_STATUSES).catch('active'),
    createdAt: isoDate,
    resolvedAt: nullableString,
  })
  .transform((a): Alert => {
    const score = clampScore(a.score);
    const level = a.level === 'urgence' || a.level === 'prealerte' ? a.level : score >= RISK_THRESHOLDS.urgence ? 'urgence' : 'prealerte';
    return {
      id: a.id,
      childId: a.childId,
      level,
      score,
      reasons: a.reasons ?? [],
      lat: a.lat ?? undefined,
      lon: a.lon ?? undefined,
      status: a.status,
      createdAt: a.createdAt,
      resolvedAt: a.resolvedAt,
    };
  });

export const placeSchema = z
  .object({
    id: z.string(),
    childId: z.string(),
    nom: z.string(),
    lat,
    lon,
    radiusM: z.number().positive(),
    source: z.enum(['declare', 'appris']).catch('declare'),
    visitCount: nullableNumber,
    isNew: z.boolean().nullable().optional(),
    icon: z.enum(['maison', 'ecole', 'lieu']).nullable().optional().catch(null),
    schedule: z.array(scheduleSchema).nullable().optional(),
  })
  .transform(
    (p): Place => ({
      id: p.id,
      childId: p.childId,
      nom: p.nom,
      lat: p.lat,
      lon: p.lon,
      radiusM: p.radiusM,
      source: p.source,
      visitCount: p.visitCount ?? undefined,
      isNew: p.isNew ?? false,
      icon: p.icon ?? undefined,
      schedule: p.schedule ?? undefined,
    })
  );

export const geofenceSchema = z
  .object({
    id: z.string(),
    childId: z.string(),
    nom: z.string(),
    type: z.enum(['autorise', 'interdit']),
    lat,
    lon,
    radiusM: z.number().positive(),
    notifyOnEnter: z.boolean(),
    notifyOnExit: z.boolean(),
    schedule: z.array(scheduleSchema).nullable().optional(),
  })
  .transform((g): Geofence => ({ ...g, schedule: g.schedule ?? undefined }));

export const shareSchema = z
  .object({
    id: z.string(),
    childId: z.string(),
    userId: z.string(),
    nom: z.string(),
    permissions: z.array(z.string()),
    status: z.enum(['invite', 'actif', 'revoque']),
    invitedAt: isoDate,
  })
  .transform((s): SecondaryAccess => ({ ...s, permissions: toPermissions(s.permissions) }));

export const permissionsSchema = z.array(z.string()).transform(toPermissions);

export const auditEntrySchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    childId: z.string(),
    secondaryUserId: z.string(),
    secondaryNom: z.string(),
    infoType: z.string(),
    timestamp: isoDate,
  })
  .transform((e): AccessAuditEntry => ({ ...e, id: String(e.id) }));

export const communityReportSchema = z
  .object({
    id: z.string(),
    description: z.string(),
    lat: lat.nullable().optional(),
    lon: lon.nullable().optional(),
    createdAt: isoDate,
    authorNom: nullableString,
  })
  // Un signalement sans lieu n'est pas affichable sur la carte du quartier : écarté.
  .transform((r): CommunityReport | null =>
    r.lat == null || r.lon == null
      ? null
      : { id: r.id, description: r.description, lat: r.lat, lon: r.lon, createdAt: r.createdAt, authorNom: r.authorNom ?? '' }
  );

export const emergencyContactSchema = z.object({
  id: z.string(),
  childId: z.string(),
  nom: z.string(),
  telephone: z.string(),
}) satisfies z.ZodType<EmergencyContact>;

export const audioLogSchema = z
  .object({
    id: z.string(),
    childId: z.string(),
    requestedBy: z.string(),
    reason: nullableString,
    startedAt: isoDate,
    labels: z.array(z.string()).nullable().optional(),
  })
  .transform(
    (l): AudioActivationLog => ({ ...l, reason: l.reason ?? '', labels: l.labels ?? [] })
  );

export const searchZoneSchema = z
  .object({
    childId: z.string(),
    lastPoint: z.unknown(),
    generatedAt: nullableString,
    confidence: z.number(),
    cells: z.array(z.object({ lat, lon, weight: z.number().min(0) })),
    topZones: z.array(z.object({ lat, lon, label: z.string(), rank: z.number().int() })),
  })
  .transform((s): SearchZone | null => {
    const lastPoint = positionSchema.safeParse(s.lastPoint);
    // Tant que le module IA « zone de recherche » n'a rien produit, le serveur renvoie
    // une coquille vide : on la traite comme « pas encore calculée », pas comme une zone.
    if (!s.generatedAt || !lastPoint.success) return null;
    return {
      childId: s.childId,
      lastPoint: lastPoint.data,
      generatedAt: s.generatedAt,
      // Confiance en pourcentage (0..100), comme RiskScore.confidence ; un serveur en 0..1 est converti.
      confidence: clampScore(s.confidence <= 1 ? s.confidence * 100 : s.confidence),
      cells: s.cells,
      topZones: [...s.topZones].sort((a, b) => a.rank - b.rank),
    };
  });

// --- Validation -----------------------------------------------------------

/** Valide une réponse ; en cas d'écart, lève une erreur `contract` explicite. */
export function parseContract<S extends z.ZodType>(schema: S, data: unknown, endpoint: string): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(userMessageFor('contract'), 502, 'contract', {
      endpoint,
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

/** Variante liste : un élément invalide est écarté (et signalé) au lieu de vider toute la liste. */
export function parseContractList<S extends z.ZodType>(
  schema: S,
  data: unknown,
  endpoint: string,
  onInvalid?: (index: number, issues: z.core.$ZodIssue[]) => void
): Exclude<z.output<S>, null>[] {
  if (!Array.isArray(data)) {
    throw new ApiError(userMessageFor('contract'), 502, 'contract', { endpoint, issues: [{ path: '', message: 'tableau attendu' }] });
  }
  const out: Exclude<z.output<S>, null>[] = [];
  data.forEach((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) {
      if (result.data !== null) out.push(result.data as Exclude<z.output<S>, null>);
    } else {
      onInvalid?.(index, result.error.issues);
    }
  });
  return out;
}
