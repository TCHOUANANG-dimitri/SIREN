/**
 * Modèle de données côté application — CDC_1_Application_Mobile.docx §5.
 * Reflète le contrat de réponse de l'API serveur (Partie 2). Les identifiants sont des UUID (chaînes).
 */

export type Role = 'principal' | 'secondaire';
export type RiskState = 'veille' | 'prealerte' | 'urgence' | 'disparition';
export type FixQuality = 'gps_recent' | 'estimee' | 'perdu';

export interface User {
  id: string;
  nom: string;
  email: string;
  telephone?: string;
  role: Role;
  langue: 'fr' | 'en';
  createdAt: string;
}

export interface Child {
  id: string;
  prenom: string;
  deviceId: string;
  photoUrl?: string;
  parentId: string;
  modelConfidence: number; // 0..100 (maturité couche 3)
  createdAt: string;
  sleepSchedule?: Schedule; // couche 1 déclarative — plage horaire de sommeil
}

export interface DeviceStatus {
  deviceId: string;
  battery: number;
  online: boolean;
  lastSeen: string;
  fixQuality: FixQuality;
  configVersion: number;
  firmwareVersion: string;
  energyMode: 'continu' | 'equilibre' | 'economie';
  sensitivity: number; // 0..100, prudent -> tolérant
}

export interface Position {
  lat: number;
  lon: number;
  speedKmh: number;
  timestamp: string;
  accuracyM: number;
  fixQuality: FixQuality;
  heading?: number; // degrés, 0 = nord — utile pour la heatmap post-disparition
}

export interface Schedule {
  jours: number[]; // 0=dimanche .. 6=samedi
  heureDebut: string; // "HH:mm"
  heureFin: string; // "HH:mm"
}

export interface Place {
  id: string;
  childId: string;
  nom: string;
  lat: number;
  lon: number;
  radiusM: number;
  source: 'declare' | 'appris';
  schedule?: Schedule[];
  visitCount?: number;
  isNew?: boolean; // badge "Nouveau" — lieu appris récemment
  icon?: 'maison' | 'ecole' | 'lieu';
}

export interface Geofence {
  id: string;
  childId: string;
  nom: string;
  type: 'autorise' | 'interdit';
  lat: number;
  lon: number;
  radiusM: number;
  schedule?: Schedule[];
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

export interface RiskSubScores {
  geo: number;
  mouvement: number;
  universel: number;
  declaratif: number;
}

export interface RiskScore {
  childId: string;
  score: number; // 0..100
  state: RiskState;
  confidence: number; // 0..100, maturité de la couche 3
  reasons: string[]; // ex: ['route inconnue', 'vitesse vehicule']
  subScores: RiskSubScores;
  timestamp: string;
}

export interface Alert {
  id: string;
  childId: string;
  level: 'prealerte' | 'urgence';
  score: number;
  reasons: string[];
  lat?: number;
  lon?: number;
  createdAt: string;
  status: 'active' | 'acquittee' | 'fausse' | 'resolue';
}

export type Permission =
  | 'position_precise'
  | 'etat_zone'
  | 'alertes_prealerte'
  | 'alertes_urgence'
  | 'historique'
  | 'mobilisation';

export interface SecondaryAccess {
  id: string;
  childId: string;
  userId: string;
  nom: string;
  permissions: Permission[];
  invitedAt: string;
  status: 'invite' | 'actif' | 'revoque';
}

export interface AccessAuditEntry {
  id: string;
  childId: string;
  secondaryUserId: string;
  secondaryNom: string;
  infoType: string;
  timestamp: string;
}

export interface SearchZoneCell {
  lat: number;
  lon: number;
  weight: number;
}

export interface SearchZoneTop {
  lat: number;
  lon: number;
  label: string;
  rank: number;
}

export interface SearchZone {
  childId: string;
  lastPoint: Position;
  generatedAt: string;
  confidence: number;
  cells: SearchZoneCell[];
  topZones: SearchZoneTop[];
}

export interface EmergencyContact {
  id: string;
  childId: string;
  nom: string;
  telephone: string;
}

export interface CommunityReport {
  id: string;
  description: string;
  lat: number;
  lon: number;
  createdAt: string;
  authorNom: string;
}

export interface AudioActivationLog {
  id: string;
  childId: string;
  requestedBy: string;
  reason: string;
  startedAt: string;
  labels: string[]; // étiquettes classées sur l'appareil — jamais l'audio brut
}
