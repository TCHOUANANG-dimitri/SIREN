import { canPerform } from '../permissions';
import type { Action } from '../permissions';

const ALL_ACTIONS: Action[] = [
  'view_position_precise',
  'view_zone_state',
  'edit_geofences',
  'receive_prealerte',
  'receive_urgence',
  'view_history',
  'access_audio',
  'close_or_mark_false_alert',
  'trigger_disappearance_mobilisation',
  'manage_secondary_users',
  'configure_device',
];

const PRINCIPAL_ONLY_ACTIONS: Action[] = [
  'edit_geofences',
  'access_audio',
  'close_or_mark_false_alert',
  'trigger_disappearance_mobilisation',
  'manage_secondary_users',
  'configure_device',
];

describe('canPerform — matrice RBAC CDC1 §7.2', () => {
  it('le principal peut tout faire, quelles que soient les permissions', () => {
    for (const action of ALL_ACTIONS) {
      expect(canPerform('principal', [], action)).toBe(true);
    }
  });

  it('un secondaire sans aucun droit ne peut rien faire', () => {
    for (const action of ALL_ACTIONS) {
      expect(canPerform('secondaire', [], action)).toBe(false);
    }
  });

  it.each(PRINCIPAL_ONLY_ACTIONS)(
    "un secondaire ne peut jamais '%s', même avec tous les droits accordés",
    (action) => {
      expect(
        canPerform(
          'secondaire',
          ['position_precise', 'etat_zone', 'alertes_prealerte', 'alertes_urgence', 'historique', 'mobilisation'],
          action
        )
      ).toBe(false);
    }
  );

  it('un secondaire avec position_precise voit la position mais pas l’état de zone seul', () => {
    expect(canPerform('secondaire', ['position_precise'], 'view_position_precise')).toBe(true);
    expect(canPerform('secondaire', ['position_precise'], 'view_zone_state')).toBe(false);
  });

  it('un secondaire avec etat_zone voit l’état de zone', () => {
    expect(canPerform('secondaire', ['etat_zone'], 'view_zone_state')).toBe(true);
  });

  it('un secondaire avec historique peut voir les trajets', () => {
    expect(canPerform('secondaire', ['historique'], 'view_history')).toBe(true);
    expect(canPerform('secondaire', [], 'view_history')).toBe(false);
  });

  it('un secondaire avec alertes_urgence reçoit les urgences mais pas les pré-alertes seules', () => {
    expect(canPerform('secondaire', ['alertes_urgence'], 'receive_urgence')).toBe(true);
    expect(canPerform('secondaire', ['alertes_urgence'], 'receive_prealerte')).toBe(false);
  });
});
