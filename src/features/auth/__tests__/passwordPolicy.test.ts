import { passwordSchema, passwordScore } from '../passwordPolicy';

describe('politique de mot de passe (CDC : 10 car., majuscule, chiffre, symbole)', () => {
  it.each(['Court1!', 'sansmajuscule1!', 'SANSMINUSCULE1!', 'SansChiffre!!', 'SansSymbole12'])('refuse %s', (pwd) => {
    expect(passwordSchema.safeParse(pwd).success).toBe(false);
  });
  it('accepte un mot de passe conforme', () => {
    expect(passwordSchema.safeParse('Yaounde2026!').success).toBe(true);
  });
  it('score 0..5', () => {
    expect(passwordScore('')).toBe(0);
    expect(passwordScore('Yaounde2026!')).toBe(5);
  });
});
