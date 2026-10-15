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

/** Code à usage unique en attente de saisie (vérification email, 2FA, mot de passe oublié). */
export interface OtpChallenge {
  /** Jeton opaque du serveur ; null en compatibilité v1 (code fixe de développement). */
  challengeToken: string | null;
  /** Durée de validité annoncée par le serveur, en secondes (null si inconnue). */
  expiresIn: number | null;
  /** Code affiché en démo / développement uniquement ; toujours absent en production. */
  devHint?: string;
}

/**
 * Connexion : soit la session est ouverte, soit le serveur exige un second
 * facteur — et dans ce cas AUCUN jeton de session n'est encore délivré.
 */
export type LoginResult =
  | ({ twofaRequired: false } & AuthSession)
  | ({ twofaRequired: true } & OtpChallenge);

export interface OtpRequestResult extends Partial<OtpChallenge> {
  /**
   * Faux si le serveur déclare l'étape OTP non requise (aucun canal configuré,
   * OTP_MODE=disabled) : l'app ouvre alors la session directement.
   */
  required: boolean;
}

export interface RegisterInput {
  nom: string;
  email: string;
  telephone?: string;
  password: string;
  langue: 'fr' | 'en';
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
}

export interface AuthRepository {
  register(input: RegisterInput): Promise<AuthSession>;
  login(input: { email: string; password: string }): Promise<LoginResult>;
  refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }>;
  /** Code de confirmation de l'email après inscription (session encore en attente). */
  requestOtp(input: { accessToken: string }): Promise<OtpRequestResult>;
  verifyOtp(input: { code: string; accessToken: string; challengeToken: string | null }): Promise<void>;
  /** Second facteur de connexion : renvoie la session une fois le code validé. */
  verifySecondFactor(input: { challengeToken: string; code: string }): Promise<AuthSession>;
  resendSecondFactor(challengeToken: string): Promise<OtpChallenge>;
  /** Même réponse que le compte existe ou non (pas d'énumération des comptes). */
  forgotPassword(email: string): Promise<OtpChallenge>;
  resetPassword(input: { challengeToken: string; code: string; newPassword: string }): Promise<void>;
  logout(refreshToken: string): Promise<void>;
}

export interface UsersRepository {
  patchMe(patch: Partial<Pick<User, 'nom' | 'telephone' | 'langue'>>): Promise<User>;
  deleteMe(): Promise<void>;
  registerPushToken(input: { token: string; platform: 'fcm' | 'apns' }): Promise<void>;
  /** Les autres sessions sont révoquées ; renvoie les nouveaux jetons de cette session. */
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<{ accessToken: string; refreshToken?: string }>;
  setTwoFactor(input: { enabled: boolean; password: string }): Promise<User>;
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
  /** `notified` : le serveur a réellement envoyé un email à la personne invitée (jamais supposé). */
  create(childId: string, input: { userIdentifier: string; permissions: Permission[] }): Promise<{ share: SecondaryAccess; notified: boolean }>;
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
