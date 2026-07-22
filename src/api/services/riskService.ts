import { getDb } from '../mock/db';
import { ApiError, simulateLatency } from '../network';
import { assertChildAccess, resolveCurrentUser } from '../mock/session';
import type { RiskScore } from '@/models/entities';

export async function getRisk(token: string | null, childId: string): Promise<RiskScore> {
  await simulateLatency(150, 350);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  const risk = getDb().riskScores[childId];
  if (!risk) throw new ApiError('Score indisponible', 404);
  return risk;
}

/** Historique 24h pour la courbe de l'onglet Score de risque — CDC1 §9.14. */
export async function getRiskHistory(token: string | null, childId: string): Promise<RiskScore[]> {
  await simulateLatency(200, 500);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  return getDb().riskHistory[childId] ?? [];
}
