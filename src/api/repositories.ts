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
import type { OtpChannel } from './contracts';

export type { OtpChannel };

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
  /** Canal réellement utilisé (null si inconnu). */
  channel?: OtpChannel | null;
}

/**
 * Connexion : soit la session est ouverte, soit le serveur exige un second
 * facteur — et dans ce cas AUCUN jeton de session n'est délivré : seul un jeton
 * MFA (5 min, inutilisable comme session) permet de choisir le canal du code.
 */
export type LoginResult =
  | ({ twofaRequired: false } & AuthSession)
  | { twofaRequired: true; mfaToken: string; channels: OtpChannel[] };

export interface OtpRequestResult extends Partial<OtpChallenge> {
  /**
   * Faux si le serveur déclare l'étape OTP non requise (aucun canal configuré,
   * OTP_MODE=disabled) : l'app ouvre alors la session directement.
   */
  required: boolean;
}

export interface RegisterInput {
  nom: string;
  /** Obligatoire, normalisé E.164 par le serveur. */
  telephone: string;
  /** Facultatif : jamais inventé. */
  email?: string;
  password: string;
  langue: 'fr' | 'en';
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
}

export interface AuthRepository {
  register(input: RegisterInput): Promise<AuthSession>;
  /** `identifier` : numéro de téléphone (tout format) ou adresse e-mail. */
  login(input: { identifier: string; password: string }): Promise<LoginResult>;
  refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }>;
  /** Canaux configurés côté serveur (un canal absent n'est jamais proposé). */
  otpChannels(): Promise<OtpChannel[]>;
  /** Code de vérification du téléphone après inscription (session encore en attente). */
  requestOtp(input: { accessToken: string; channel: OtpChannel }): Promise<OtpRequestResult>;
  verifyOtp(input: { code: string; accessToken: string; challengeToken: string | null }): Promise<void>;
  /** Envoie (ou renvoie) le code de connexion par le canal choisi ; invalide le précédent. */
  sendSecondFactor(input: { mfaToken: string; channel: OtpChannel }): Promise<OtpChallenge>;
  /** Second facteur de connexion : renvoie la session une fois le code validé. */
  verifySecondFactor(input: { challengeToken: string; code: string }): Promise<AuthSession>;
  /** Même réponse que le compte existe ou non (pas d'énumération des comptes). */
  forgotPassword(input: { identifier: string; channel: OtpChannel }): Promise<OtpChallenge>;
  resetPassword(input: { challengeToken: string; code: string; newPassword: string }): Promise<void>;
  logout(refreshToken: string): Promise<void>;
}

export interface UsersRepository {
  /** Le téléphone ne se modifie pas ici : voir requestPhoneChange (mot de passe + code). */
  patchMe(patch: Partial<Pick<User, 'nom' | 'langue'>>): Promise<User>;
  /** Changement (ou ajout) du numéro, étape 1 : mot de passe vérifié, code envoyé au NOUVEAU numéro. */
  requestPhoneChange(input: { currentPassword: string; newPhone: string; channel: 'sms' | 'whatsapp' }): Promise<OtpChallenge>;
  /** Étape 2 : le code prouve la possession du nouveau numéro ; renvoie le compte à jour. */
  confirmPhoneChange(input: { challengeToken: string; code: string }): Promise<User>;
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
  /** Le PIN d'activation imprimé sur la boîte sera demandé. */
  pinRequired: boolean;
}

export interface ChildrenRepository {
  list(): Promise<Child[]>;
  /** `deviceId` exact `SIREN-XXXXX-XXXXX` (sensible à la casse, jamais converti). */
  create(input: { prenom: string; deviceId: string; photoUrl?: string; activationPin?: string }): Promise<Child>;
  /** (Ré)associe un dispositif à un enfant existant ; l'ancien est libéré. */
  pairDevice(childId: string, input: { deviceId: string; activationPin?: string }): Promise<Child>;
  /** Dissocie le dispositif (parent principal) ; l'historique reste à l'enfant. */
  unpairDevice(childId: string): Promise<Child>;
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

export interface RelayResult {
  status: 'accepted' | 'duplicate' | 'rejected' | 'forbidden';
  reason?: string;
}

export interface DeviceRepository {
  getSettings(childId: string): Promise<DeviceSettings>;
  /** Trames « ; » reçues hors ligne, relayées telles quelles (au plus 100 par appel). */
  relayFrames(frames: string[]): Promise<RelayResult[]>;
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
