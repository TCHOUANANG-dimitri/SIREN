import { CREDIT_COSTS, type CreditOperation } from '@/config/business';

export type CreditCosts = Record<CreditOperation, number>;

/**
 * Règles du système de crédits (CDC App §3, §4.6) — produit de PAIEMENT, pas IA.
 *
 * Le solde fait foi côté serveur ; ces fonctions ne servent qu'à informer
 * l'utilisateur avant une action (coût, blocage). Aucun débit n'est décidé ici.
 */

export interface CreditDecision {
  allowed: boolean;
  cost: number;
  /** Raison lisible par le code appelant (clé i18n `credits.*`). */
  reason: 'ok' | 'insufficient_balance' | 'emergency_exempt' | 'feature_disabled';
}

export function costOf(operation: CreditOperation, costs: CreditCosts = CREDIT_COSTS): number {
  return costs[operation];
}

/**
 * Une urgence déjà ouverte n'est JAMAIS interrompue ni bloquée pour défaut de
 * crédit (CDC App §3 « Crédits », §11 parcours 3, §13 « À ne pas oublier »).
 */
export function decide(params: {
  operation: CreditOperation;
  balance: number | null;
  emergencyActive: boolean;
  creditsEnabled: boolean;
  costs?: CreditCosts;
}): CreditDecision {
  const cost = costOf(params.operation, params.costs);
  if (!params.creditsEnabled) return { allowed: true, cost: 0, reason: 'feature_disabled' };
  if (params.emergencyActive) return { allowed: true, cost, reason: 'emergency_exempt' };
  // Solde inconnu (hors-ligne) : on laisse le serveur trancher plutôt que bloquer à tort.
  if (params.balance === null || params.balance >= cost) return { allowed: true, cost, reason: 'ok' };
  return { allowed: false, cost, reason: 'insufficient_balance' };
}
