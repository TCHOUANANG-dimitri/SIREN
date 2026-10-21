import {
  formatSerialBody,
  isValidSerial,
  nextSerialInput,
  parseQrPayload,
  sanitizeSerialBody,
  serialFromBody,
} from '../serial';

describe('numéro de série SIREN-XXXXX-XXXXX', () => {
  it('accepte uniquement le format exact, sensible à la casse', () => {
    expect(isValidSerial('SIREN-AB12C-XY9Z0')).toBe(true);
    expect(isValidSerial('SIREN-ab12c-xy9z0')).toBe(true);
    expect(isValidSerial('siren-AB12C-XY9Z0')).toBe(false);
    expect(isValidSerial('SIREN-AB12CXY9Z0')).toBe(false);
    expect(isValidSerial('SIREN-ÀB12C-XY9Z0')).toBe(false);
  });

  it('QR : le contenu est une donnée, jamais une URL', () => {
    expect(parseQrPayload(' SIREN-ab12C-XY9z0 ')).toBe('SIREN-ab12C-XY9z0');
    expect(parseQrPayload('https://evil.example/SIREN-AB12C-XY9Z0')).toBeNull();
    expect(parseQrPayload('SIREN-AB12C-XY9Z0?x=1')).toBeNull();
    expect(parseQrPayload('javascript:alert(1)')).toBeNull();
    expect(parseQrPayload(42)).toBeNull();
  });

  it('ne convertit jamais la casse', () => {
    expect(sanitizeSerialBody('ab12cXY9z0').body).toBe('ab12cXY9z0');
    expect(serialFromBody('ab12cXY9z0')).toBe('SIREN-ab12c-XY9z0');
  });

  it('gère le collage du numéro complet et ignore les caractères invalides', () => {
    expect(sanitizeSerialBody('SIREN-AB12C-XY9Z0')).toEqual({ body: 'AB12CXY9Z0', rejected: false });
    expect(sanitizeSerialBody('AB12C XY9Z0')).toEqual({ body: 'AB12CXY9Z0', rejected: false });
    expect(sanitizeSerialBody('AB@12é')).toEqual({ body: 'AB12', rejected: true });
    expect(sanitizeSerialBody('AB12CXY9Z0EXTRA').body).toBe('AB12CXY9Z0');
  });

  it('affiche le tiret automatiquement après le 5e caractère', () => {
    expect(formatSerialBody('AB12')).toBe('AB12');
    expect(formatSerialBody('AB12C')).toBe('AB12C');
    expect(formatSerialBody('AB12CX')).toBe('AB12C-X');
    expect(serialFromBody('AB12CXY9Z')).toBeNull(); // validation seulement quand c'est complet
  });

  it('frappe en fin de champ : le curseur suit, le tiret apparaît puis disparaît', () => {
    let state = nextSerialInput('AB12C', 'AB12CX', 5);
    expect(state).toMatchObject({ formatted: 'AB12C-X', cursor: 7 });
    state = nextSerialInput('AB12C-X', 'AB12C-', 7); // retour arrière
    expect(state).toMatchObject({ formatted: 'AB12C', cursor: 5 });
  });

  it('édition au milieu : pas de saut du curseur en fin de champ', () => {
    // Insertion de « Q » avant « X » (curseur juste après le tiret, position 6).
    const state = nextSerialInput('AB12C-XY9', 'AB12C-QXY9', 6);
    expect(state.formatted).toBe('AB12C-QXY9');
    expect(state.cursor).toBe(7);
    // Suppression du 2e caractère (curseur en 2).
    const removed = nextSerialInput('AB12C-XY9', 'A12C-XY9', 2);
    expect(removed).toMatchObject({ formatted: 'A12CX-Y9', cursor: 1 });
  });

  it('collage du numéro complet : curseur en fin', () => {
    expect(nextSerialInput('', 'SIREN-AB12C-XY9Z0', 0)).toMatchObject({ body: 'AB12CXY9Z0', formatted: 'AB12C-XY9Z0', cursor: 11 });
  });
});
