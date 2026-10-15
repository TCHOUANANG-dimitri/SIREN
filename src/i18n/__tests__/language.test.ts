import { deviceLanguage, resolveLanguage } from '../language';
import { en, fr } from '../resources';

describe('langue de l’interface', () => {
  it('priorité : choix sur le téléphone > compte > téléphone', () => {
    expect(resolveLanguage({ explicit: 'en', account: 'fr', device: 'fr' })).toBe('en');
    expect(resolveLanguage({ explicit: null, account: 'en', device: 'fr' })).toBe('en');
    expect(resolveLanguage({ explicit: null, account: null, device: 'en' })).toBe('en');
  });

  it('une langue de téléphone non prise en charge retombe sur le français', () => {
    expect(deviceLanguage('de')).toBe('fr');
    expect(deviceLanguage(undefined)).toBe('fr');
    expect(deviceLanguage('en')).toBe('en');
  });
});

describe('catalogues', () => {
  const flat = (obj: Record<string, unknown>, prefix = ''): [string, string][] =>
    Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v as Record<string, unknown>, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)]]));
  const vars = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((v) => v !== 'count').sort().join(',');
  const enMap = new Map(flat(en));

  it('mêmes variables {{x}} en FR et en EN', () => {
    const mismatches = flat(fr).filter(([key, value]) => enMap.has(key) && vars(value) !== vars(enMap.get(key) as string));
    expect(mismatches).toEqual([]);
  });

  it('aucune traduction vide', () => {
    expect([...flat(fr), ...flat(en)].filter(([, v]) => v.trim() === '')).toEqual([]);
  });
});
