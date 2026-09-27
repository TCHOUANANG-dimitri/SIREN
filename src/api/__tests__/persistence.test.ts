import { shouldPersistQuery } from '../persistence';
import { queryKeys } from '../queryKeys';

describe('cache hors-ligne persistant', () => {
  it('persiste position, statut, score, alertes, lieux, périmètres', () => {
    for (const key of [
      queryKeys.children,
      queryKeys.position('c1'),
      queryKeys.childStatus('c1'),
      queryKeys.risk('c1'),
      queryKeys.alerts('c1'),
      queryKeys.allAlerts,
      queryKeys.places('c1'),
      queryKeys.geofences('c1'),
    ]) {
      expect(shouldPersistQuery(key)).toBe(true);
    }
  });
  it('ne persiste ni historique, ni audit, ni zone de recherche, ni partages', () => {
    for (const key of [
      queryKeys.history('c1'),
      queryKeys.accessAudit('c1'),
      queryKeys.searchZone('c1'),
      queryKeys.shares('c1'),
      queryKeys.community,
    ]) {
      expect(shouldPersistQuery(key)).toBe(false);
    }
  });
});
