import { pickActiveChild } from '../useSelectedChild';
import type { Child } from '@/models/entities';

const child = (id: string) => ({ id, prenom: id }) as Child;

describe('enfant sélectionné (Carte, Partage)', () => {
  it('garde la sélection si l’enfant existe', () => {
    expect(pickActiveChild([child('a'), child('b')], 'b')?.id).toBe('b');
  });
  it('enfant supprimé ou autre compte : retombe sur le premier', () => {
    expect(pickActiveChild([child('a'), child('b')], 'zzz')?.id).toBe('a');
    expect(pickActiveChild([child('a')], null)?.id).toBe('a');
  });
  it('aucun enfant : aucune sélection', () => {
    expect(pickActiveChild([], 'a')).toBeUndefined();
    expect(pickActiveChild(undefined, 'a')).toBeUndefined();
  });
});
