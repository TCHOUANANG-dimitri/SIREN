import type {
  AccessAuditEntry,
  Alert,
  AlertStatus,
  AudioActivationLog,
  AuthSession,
  Child,
  CommunityReport,
  DeviceStatus,
  EmergencyContact,
  Geofence,
  Permission,
  Place,
  Position,
  RiskScore,
  SearchZone,
  SecondaryAccess,
  User,
  ZoneState,
} from '@/models/entities';

/**
 * Contrat unique entre l'UI (hooks React Query) et la source de données.
 * Deux implémentations : `mock` (backend simulé en mémoire) et `live` (HTTP
 * vers le serveur SIREN). L'UI ne sait jamais laquelle est active.
 *
 * Le jeton d'accès n'apparaît pas dans les signatures : chaque implémentation
 * le lit elle-même depuis la session, ce qui permet au client live de le
 * rafraîchir de façon transparente.
 */

export interface LoginResult extends AuthSession {
  /** Le serveur exige un second facteur avant d'ouvrir la session. */
  twofaRequired: boolean;
}

export interface OtpRequestResult {
  /**
   * Faux si le serveur déclare l'étape OTP non requise (aucun fournisseur
   * SMS/email configuré) : l'app ouvre alors la session directement.
   */
  required: boolean;
  /** Code affiché en démo uniquement (mock) ; toujours absent en live. */
  devHint?: string;
}

export interface AuthRepository {
  register(input: { nom: string; email: string; telephone?: string; password: string }): Promise<AuthSession>;
  login(input: { email: string; password: string }): Promise<LoginResult>;
  refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }>;
  requestOtp(input: { destination: string }): Promise<OtpRequestResult>;
  verifyOtp(input: { code: string; accessToken: string }): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  logout(refreshToken: string): Promise<void>;
}

export interface UsersRepository {
  patchMe(patch: Partial<Pick<User, 'nom' | 'telephone' | 'langue'>>): Promise<User>;
  deleteMe(): Promise<void>;
  registerPushToken(input: { token: string; platform: 'fcm' | 'apns' }): Promise<void>;
}

export interface DeviceLookup {
  deviceId: string;
  online: boolean;
  battery: number | null;
}

export interface ChildrenRepository {
  list(): Promise<Child[]>;
  create(input: { prenom: string; deviceId: string; photoUrl?: string }): Promise<Child>;
  getStatus(childId: string): Promise<DeviceStatus>;
  patchContext(childId: string, patch: Partial<Pick<Child, 'sleepSchedule'>>): Promise<Child>;
  findDevice(deviceId: string): Promise<DeviceLookup>;
}

export interface TrackingRepository {
  getPosition(childId: string): Promise<Position | null>;
  requestFix(childId: string): Promise<void>;
  getZoneState(childId: string): Promise<ZoneState>;
  getHistory(childId: string, from?: string, to?: string): Promise<Position[]>;
}

export type PlaceInput = Omit<Place, 'id' | 'childId' | 'source'>;
export type PlacePatch = Partial<Pick<Place, 'nom' | 'radiusM' | 'isNew'>>;

export interface PlacesRepository {
  list(childId: string): Promise<Place[]>;
  create(childId: string, input: PlaceInput): Promise<Place>;
  patch(placeId: string, patch: PlacePatch): Promise<Place>;
}

export type GeofenceInput = Omit<Geofence, 'id' | 'childId'>;

export interface GeofencesRepository {
  list(childId: string): Promise<Geofence[]>;
  create(childId: string, input: GeofenceInput): Promise<Geofence>;
  patch(geofenceId: string, patch: Partial<GeofenceInput>): Promise<Geofence>;
  remove(geofenceId: string): Promise<void>;
}

export interface RiskRepository {
  get(childId: string): Promise<RiskScore>;
  history(childId: string): Promise<RiskScore[]>;
}

export interface AlertsRepository {
  listForChild(childId: string): Promise<Alert[]>;
  listAll(): Promise<Alert[]>;
  patch(alertId: string, status: AlertStatus): Promise<Alert>;
}

export interface SharingRepository {
  list(childId: string): Promise<SecondaryAccess[]>;
  create(childId: string, input: { userIdentifier: string; permissions: Permission[] }): Promise<SecondaryAccess>;
  get(shareId: string): Promise<SecondaryAccess>;
  patch(shareId: string, patch: { permissions?: Permission[]; status?: SecondaryAccess['status'] }): Promise<SecondaryAccess>;
  myPermissions(childId: string): Promise<Permission[]>;
  audit(childId: string): Promise<AccessAuditEntry[]>;
}

export interface CommunityRepository {
  list(): Promise<CommunityReport[]>;
  create(input: { description: string; lat: number; lon: number }): Promise<CommunityReport>;
}

export interface SearchZoneRepository {
  /** null tant que le module IA n'a produit aucune zone. */
  get(childId: string): Promise<SearchZone | null>;
  declareDisappearance(childId: string): Promise<void>;
}

export interface EmergencyContactsRepository {
  list(childId: string): Promise<EmergencyContact[]>;
  create(childId: string, input: { nom: string; telephone: string }): Promise<EmergencyContact>;
}

export interface AudioRepository {
  activate(childId: string, input: { reason: string; explicitRequest?: boolean }): Promise<AudioActivationLog>;
  logs(childId: string): Promise<AudioActivationLog[]>;
}

export interface DeviceSettings {
  energyMode: DeviceStatus['energyMode'];
  sensitivity: DeviceStatus['sensitivity'];
  configVersion: number;
}

export interface DeviceRepository {
  getSettings(childId: string): Promise<DeviceSettings>;
  patchSettings(
    childId: string,
    patch: { energyMode?: NonNullable<DeviceStatus['energyMode']>; sensitivity?: number }
  ): Promise<DeviceSettings>;
}

export interface SirenApi {
  mode: 'mock' | 'live';
  auth: AuthRepository;
  users: UsersRepository;
  children: ChildrenRepository;
  tracking: TrackingRepository;
  places: PlacesRepository;
  geofences: GeofencesRepository;
  risk: RiskRepository;
  alerts: AlertsRepository;
  sharing: SharingRepository;
  community: CommunityRepository;
  searchZone: SearchZoneRepository;
  emergencyContacts: EmergencyContactsRepository;
  audio: AudioRepository;
  device: DeviceRepository;
}
