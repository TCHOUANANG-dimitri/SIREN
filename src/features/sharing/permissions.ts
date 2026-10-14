import type { Permission, Role } from '@/models/entities';

/**
 * Matrice RBAC — CDC_1_Application_Mobile.docx §7.2.
 * Source de vérité unique consommée par useRequirePermission/useRequireRole.
 * Le principal a toujours accès à tout ; le secondaire dépend de ses droits accordés,
 * et certaines actions lui sont structurellement interdites quel que soit le droit.
 */
export type Action =
  | 'view_position_precise'
  | 'view_zone_state'
  | 'edit_geofences'
  | 'receive_prealerte'
  | 'receive_urgence'
  | 'view_history'
  | 'access_audio'
  | 'close_or_mark_false_alert'
  | 'trigger_disappearance_mobilisation'
  | 'manage_secondary_users'
  | 'configure_device';

/** null = jamais accessible à un secondaire, quel que soit le droit accordé. */
const secondaryRequirement: Record<Action, Permission | null> = {
  view_position_precise: 'position_precise',
  view_zone_state: 'etat_zone',
  edit_geofences: null,
  receive_prealerte: 'alertes_prealerte',
  receive_urgence: 'alertes_urgence',
  view_history: 'historique',
  access_audio: null,
  close_or_mark_false_alert: null,
  trigger_disappearance_mobilisation: null,
  manage_secondary_users: null,
  configure_device: null,
};

export function canPerform(
  role: Role,
  grantedPermissions: Permission[],
  action: Action
): boolean {
  if (role === 'principal') return true;
  const required = secondaryRequirement[action];
  if (required === null) return false;
  return grantedPermissions.includes(required);
}

export const ALL_PERMISSIONS: Permission[] = [
  'position_precise',
  'etat_zone',
  'alertes_prealerte',
  'alertes_urgence',
  'historique',
  'mobilisation',
];

/** Libellés traduits d'un droit (clés i18n `permissions.<droit>.label|description`). */
export function permissionLabel(t: (key: string) => string, permission: Permission) {
  return { label: t(`permissions.${permission}.label`), description: t(`permissions.${permission}.description`) };
}
