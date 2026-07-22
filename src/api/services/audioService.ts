import { getDb, mutateDb, genId } from '../mock/db';
import { ApiError, simulateLatency } from '../network';
import { assertChildAccess, assertPrincipal, resolveCurrentUser } from '../mock/session';
import type { AudioActivationLog } from '@/models/entities';

/**
 * Écoute audio encadrée — CDC1 §9.20. Classification sur l'appareil, jamais l'audio
 * brut transmis : seules des étiquettes (cri, voix, véhicule…) sont renvoyées.
 */
export async function requestAudioActivation(
  token: string | null,
  childId: string,
  input: { reason: string; explicitRequest?: boolean }
): Promise<AudioActivationLog> {
  await simulateLatency(400, 900);
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  assertPrincipal(user);

  const risk = getDb().riskScores[childId];
  const conditionsMet = risk?.state === 'urgence' || risk?.state === 'disparition' || input.explicitRequest;
  if (!conditionsMet) {
    throw new ApiError(
      "Écoute non disponible : réservée à une urgence confirmée ou une demande explicite motivée.",
      403
    );
  }

  const labels =
    risk?.state === 'urgence' || risk?.state === 'disparition'
      ? ['Voix élevée', 'Bruit de véhicule', 'Environnement extérieur']
      : ['Environnement calme', 'Voix normale'];

  const log: AudioActivationLog = {
    id: genId('audio'),
    childId,
    requestedBy: user.nom,
    reason: input.reason,
    startedAt: new Date().toISOString(),
    labels,
  };
  mutateDb((d) => {
    d.audioLogs.unshift(log);
  });
  return log;
}

export async function listAudioLogs(token: string | null, childId: string): Promise<AudioActivationLog[]> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  assertChildAccess(childId, user);
  assertPrincipal(user);
  return getDb().audioLogs.filter((l) => l.childId === childId);
}
