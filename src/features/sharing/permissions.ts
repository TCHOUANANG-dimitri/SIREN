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

export const permissionLabels: Record<Permission, { label: string; description: string }> = {
  position_precise: {
    label: 'Position précise en temps réel',
    description: 'Voir la localisation exacte sur la carte.',
  },
  etat_zone: {
    label: 'État de zone',
    description: 'Savoir si l’enfant est dans ou hors d’une zone connue, sans la carte précise.',
  },
  alertes_prealerte: {
    label: 'Alertes de pré-alerte',
    description: 'Être notifié en cas de comportement inhabituel.',
  },
  alertes_urgence: {
    label: 'Alertes d’urgence',
    description: 'Être notifié en cas d’urgence confirmée.',
  },
  historique: {
    label: 'Historique des trajets',
    description: 'Consulter les déplacements passés.',
  },
  mobilisation: {
    label: 'Mobilisation en cas de disparition',
    description: 'Être sollicité pour aider aux recherches.',
  },
};
