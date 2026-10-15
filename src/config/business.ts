/**
 * Paramètres métier centralisés.
 *
 * Toute valeur marquée « à valider » provient d'une proposition de travail du
 * CDC Application (19/09/2026) et n'est PAS arrêtée par l'équipe. Elle ne doit
 * être lue qu'ici — jamais recopiée dans un écran — pour pouvoir être remplacée
 * par la configuration serveur dès que le contrat l'expose.
 */

export const RISK_THRESHOLDS = {
  /** Score ≥ prealerte → Pré-alerte (CDC App §1, CDC IA §6). */
  prealerte: 30,
  /** Score ≥ urgence → Urgence. */
  urgence: 70,
} as const;

export type RiskThresholds = { prealerte: number; urgence: number };

export const SHARING_RULES = {
  /** Maximum de secondaires actifs ou invités par enfant (CDC App §2, §4.5). */
  maxSecondariesPerChild: 3,
} as const;

export const TRACKING_POLICY = {
  /** Cadence produit de suivi standard (CDC App §3, §9) — la cadence device peut différer. */
  standardIntervalMinutes: 30,
  /** Au-delà, la position est présentée comme « estimée » (plus fraîche mais pas récente). */
  recentMaxAgeMinutes: 35,
  /** Au-delà, la position est considérée perdue (≈ 2 cycles manqués). */
  lostAfterMinutes: 65,
  /** Précision au-delà de laquelle un point n'est plus « GPS récent » (mètres). */
  maxAccurateRadiusM: 100,
} as const;

/** Coûts en crédits — À VALIDER (CDC App §3, proposition de travail). */
export const CREDIT_COSTS = {
  standardGpsCycle: 1,
  immediatePositionRequest: 5,
  nightlyLearning: 10,
} as const;

export type CreditOperation = keyof typeof CREDIT_COSTS;

/** Batterie faible (%), seuil d'information — à confirmer avec le pôle Dispositif. */
export const LOW_BATTERY_PERCENT = 20;

/**
 * Numéros d'urgence composés depuis l'écran d'urgence — Cameroun.
 * 117 : Police secours. À VALIDER par l'équipe (et à rendre configurable par
 * pays si l'app est distribuée hors Cameroun).
 */
export const EMERGENCY_NUMBERS = {
  police: '117',
} as const;

/**
 * Pondération de la fusion des sous-scores (document « Couches déclarative +
 * universelle » v1.0 du 14/10/2026, identique à server/app/services/fusion_score.py).
 * Affichage seulement : le score est toujours calculé par le serveur.
 */
export const FUSION_WEIGHTS = {
  universel: 0.35,
  declaratif: 0.3,
  geo: 0.2,
  mouvement: 0.15,
} as const;

/**
 * Plafonds de configuration par enfant (server/app/rules/declarative.py :
 * MAX_GEOFENCES_PER_CHILD, MAX_PLACES_PER_CHILD). Le serveur les applique ;
 * l'app les vérifie avant l'envoi pour répondre tout de suite.
 */
export const CONFIG_LIMITS = {
  geofencesPerChild: 20,
  placesPerChild: 20,
} as const;

/** Rayon par défaut d'un lieu déclaré (m) — DEFAULT_PLACE_RADIUS_M côté serveur. */
export const DEFAULT_PLACE_RADIUS_M = 100;
