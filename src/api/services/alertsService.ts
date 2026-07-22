import { getDb, mutateDb } from '../mock/db';
import { ApiError, simulateLatency } from '../network';
import { assertChildAccess, assertPrincipal, resolveCurrentUser } from '../mock/session';
import { resolveScenarioAlert } from '../mock/scenarioEngine';
import type { Alert } from '@/models/entities';

export async function listAlerts(token: string | null, childId: string): Promise<Alert[]> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  const perms = assertChildAccess(childId, user);
  if (user.role === 'secondaire' && !perms.includes('alertes_prealerte') && !perms.includes('alertes_urgence')) {
    throw new ApiError('Accès refusé', 403);
  }
  return getDb()
    .alerts.filter((a) => a.childId === childId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Toutes les alertes visibles par l'utilisateur courant, tous enfants confondus (écran Alertes). */
export async function listAllAlerts(token: string | null): Promise<Alert[]> {
  await simulateLatency();
  const user = resolveCurrentUser(token);
  const db = getDb();
  const childIds =
    user.role === 'principal'
      ? db.children.filter((c) => c.parentId === user.id).map((c) => c.id)
      : db.secondaryAccess
          .filter(
            (s) =>
              s.userId === user.id &&
              s.status === 'actif' &&
              (s.permissions.includes('alertes_prealerte') || s.permissions.includes('alertes_urgence'))
          )
          .map((s) => s.childId);
  return db.alerts
    .filter((a) => childIds.includes(a.childId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function patchAlert(
  token: string | null,
  alertId: string,
  status: Alert['status']
): Promise<Alert> {
  await simulateLatency(250, 550);
  const user = resolveCurrentUser(token);
  const db = getDb();
  const alert = db.alerts.find((a) => a.id === alertId);
  if (!alert) throw new ApiError('Alerte introuvable', 404);
  assertChildAccess(alert.childId, user);
  assertPrincipal(user); // "Clore une urgence / marquer fausse" réservé au principal — CDC §7.2
  mutateDb((d) => {
    const target = d.alerts.find((a) => a.id === alertId);
    if (target) target.status = status;
  });
  if (status === 'acquittee' || status === 'fausse' || status === 'resolue') {
    resolveScenarioAlert(alert.childId);
  }
  return { ...alert, status };
}
