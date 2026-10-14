import { redact } from '../logger';

describe('masquage des journaux', () => {
  it('masque jetons, coordonnées, téléphones, emails et textes libres', () => {
    const out = redact({
      accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc',
      lat: 3.86,
      lon: 11.5,
      telephone: '+237 6 99 99 99 99',
      nested: { email: 'parent@example.org', description: 'vu près du marché' },
      status: 401,
      stage: 'bootstrap',
    }) as Record<string, unknown>;
    expect(out.accessToken).toBe('[masqué]');
    expect(out.lat).toBe('[masqué]');
    expect(out.telephone).toBe('[masqué]');
    expect((out.nested as Record<string, unknown>).email).toBe('[masqué]');
    expect(out.status).toBe(401);
    expect(out.stage).toBe('bootstrap');
  });
  it('masque aussi les secrets glissés dans des chaînes', () => {
    expect(redact('Authorization: Bearer abc.def.ghi pour parent@example.org au +237699999999')).toBe(
      'Authorization: Bearer [masqué] pour [email] au [tel]'
    );
  });
});
