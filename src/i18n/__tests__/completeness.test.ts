import fs from 'fs';
import path from 'path';
import fr from '../fr.json';
import en from '../en.json';

/** Garantit FR + EN complets (CDC App §8) : toute clé utilisée existe dans les deux langues. */
function flatten(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}${k}`;
    if (v && typeof v === 'object') flatten(v as Record<string, unknown>, `${key}.`).forEach((x) => keys.add(x));
    else keys.add(key);
  }
  return keys;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const FR = flatten(fr);
const EN = flatten(en);
const has = (keys: Set<string>, k: string) => keys.has(k) || keys.has(`${k}_one`) || keys.has(`${k}_other`);

describe('traductions', () => {
  it('FR et EN ont exactement les mêmes clés', () => {
    expect([...FR].filter((k) => !EN.has(k))).toEqual([]);
    expect([...EN].filter((k) => !FR.has(k))).toEqual([]);
  });

  it('chaque clé utilisée dans le code existe', () => {
    const used = new Set<string>();
    const patterns = [
      /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g,
      /['"]((?:validation|apiErrors|passwordStrength)\.[a-zA-Z0-9_]+)['"]/g,
    ];
    for (const file of sourceFiles(path.join(__dirname, '..', '..'))) {
      const content = fs.readFileSync(file, 'utf8');
      for (const re of patterns) for (const m of content.matchAll(re)) used.add(m[1]);
    }
    const missing = [...used].filter((k) => !has(FR, k) || !has(EN, k));
    expect(missing).toEqual([]);
  });
});
