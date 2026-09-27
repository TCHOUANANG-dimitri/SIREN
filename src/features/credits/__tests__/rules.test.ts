import { decide } from '../rules';
import { isFinal, newPurchaseKey } from '../payment';

describe('crédits', () => {
  it('fonction désactivée : rien n’est bloqué ni facturé', () => {
    expect(decide({ operation: 'immediatePositionRequest', balance: 0, emergencyActive: false, creditsEnabled: false })).toEqual({
      allowed: true,
      cost: 0,
      reason: 'feature_disabled',
    });
  });

  it('bloque une demande de position si le solde est insuffisant', () => {
    expect(decide({ operation: 'immediatePositionRequest', balance: 4, emergencyActive: false, creditsEnabled: true })).toMatchObject({
      allowed: false,
      cost: 5,
      reason: 'insufficient_balance',
    });
  });

  it('une urgence ouverte n’est JAMAIS bloquée par un solde nul', () => {
    expect(decide({ operation: 'immediatePositionRequest', balance: 0, emergencyActive: true, creditsEnabled: true })).toMatchObject({
      allowed: true,
      reason: 'emergency_exempt',
    });
  });

  it('solde inconnu (hors-ligne) : le serveur tranche', () => {
    expect(decide({ operation: 'standardGpsCycle', balance: null, emergencyActive: false, creditsEnabled: true }).allowed).toBe(true);
  });

  it('coûts paramétrables (tarifs non validés)', () => {
    const costs = { standardGpsCycle: 2, immediatePositionRequest: 8, nightlyLearning: 12 };
    expect(decide({ operation: 'immediatePositionRequest', balance: 7, emergencyActive: false, creditsEnabled: true, costs }).allowed).toBe(false);
  });

  it('clés d’idempotence uniques et statuts finaux', () => {
    expect(newPurchaseKey('p1', 1)).not.toEqual(newPurchaseKey('p1', 1));
    expect(isFinal('pending')).toBe(false);
    expect(isFinal('succeeded')).toBe(true);
  });
});
