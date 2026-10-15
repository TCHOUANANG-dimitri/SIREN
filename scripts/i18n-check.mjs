#!/usr/bin/env node
/**
 * Vérification des traductions (FR/EN) — `npm run i18n:check`.
 *
 * Erreurs (code de sortie 1) :
 *   MISSING_TRANSLATIONS    clé présente dans une langue et pas dans l'autre,
 *                           ou utilisée dans le code sans exister
 *   PLACEHOLDER_MISMATCHES  variables {{x}} différentes entre FR et EN
 *   EMPTY_TRANSLATIONS      valeur vide
 *   HARDCODED_UI_TEXT       texte d'interface écrit en dur dans un écran/composant
 * Avertissements :
 *   UNUSED_KEYS             clé jamais référencée (à supprimer après vérification)
 *
 * Options : --json (sortie machine), --strict (les avertissements deviennent des erreurs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = path.join(ROOT, 'src/i18n/locales');
const SRC = path.join(ROOT, 'src');
const LANGS = ['fr', 'en'];
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}${k}`;
    if (v && typeof v === 'object') flatten(v, `${key}.`, out);
    else out.set(key, v);
  }
  return out;
}

function loadLang(lang) {
  const merged = new Map();
  for (const file of fs.readdirSync(path.join(LOCALES, lang)).filter((f) => f.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(LOCALES, lang, file), 'utf8'));
    for (const [k, v] of flatten(data)) merged.set(k, v);
  }
  return merged;
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'locales' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const placeholders = (value) => new Set([...String(value).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((v) => v !== 'count'));
const baseKey = (key) => key.replace(PLURAL_SUFFIX, '');

const catalogs = Object.fromEntries(LANGS.map((l) => [l, loadLang(l)]));
const report = { MISSING_TRANSLATIONS: [], PLACEHOLDER_MISMATCHES: [], EMPTY_TRANSLATIONS: [], HARDCODED_UI_TEXT: [], UNUSED_KEYS: [] };

// 1. Parité des clés et valeurs vides.
for (const lang of LANGS) {
  for (const other of LANGS.filter((l) => l !== lang)) {
    for (const key of catalogs[lang].keys()) {
      if (!catalogs[other].has(key)) report.MISSING_TRANSLATIONS.push(`${key} (absent en ${other})`);
    }
  }
  for (const [key, value] of catalogs[lang]) {
    if (typeof value === 'string' && value.trim() === '') report.EMPTY_TRANSLATIONS.push(`${lang}:${key}`);
  }
}

// 2. Variables identiques (les formes plurielles d'une même clé sont comparées ensemble ; {{count}} est libre).
const groups = new Map();
for (const lang of LANGS) {
  for (const [key, value] of catalogs[lang]) {
    const g = groups.get(baseKey(key)) ?? {};
    g[lang] = new Set([...(g[lang] ?? []), ...placeholders(value)]);
    groups.set(baseKey(key), g);
  }
}
for (const [key, byLang] of groups) {
  const [a, b] = LANGS.map((l) => [...(byLang[l] ?? [])].sort().join(','));
  if (a !== b) report.PLACEHOLDER_MISMATCHES.push(`${key} — fr: {${a}} / en: {${b}}`);
}

// 3. Clés utilisées dans le code.
const allKeys = new Set([...catalogs.fr.keys()].map(baseKey));
const staticUsed = new Set();
const dynamicPrefixes = new Set();
const literalStrings = new Set();
const files = sourceFiles(SRC);
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const m of content.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g)) staticUsed.add(m[1]);
  for (const m of content.matchAll(/\bt\(\s*`([a-zA-Z0-9_.-]+)\.\$\{/g)) dynamicPrefixes.add(`${m[1]}.`);
  for (const m of content.matchAll(/`([a-zA-Z0-9_.-]+)\.\$\{/g)) dynamicPrefixes.add(`${m[1]}.`);
  for (const m of content.matchAll(/['"]([a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+)['"]/g)) literalStrings.add(m[1]);
}
for (const key of staticUsed) {
  if (!allKeys.has(key) && !catalogs.fr.has(key)) report.MISSING_TRANSLATIONS.push(`${key} (utilisée dans le code, absente des catalogues)`);
}
for (const key of allKeys) {
  const referenced =
    staticUsed.has(key) ||
    literalStrings.has(key) ||
    [...dynamicPrefixes].some((p) => key.startsWith(p));
  if (!referenced) report.UNUSED_KEYS.push(key);
}

// 4. Texte d'interface en dur (heuristique) : texte JSX et props textuelles littérales.
const UI_PROPS = /\b(label|title|placeholder|message|accessibilityLabel|accessibilityHint|description|hint)=["']([^"'{}]*[A-Za-zÀ-ÿ]{3,}[^"'{}]*)["']/g;
const JSX_TEXT = />\s*([A-Za-zÀ-ÿ][^<>{}\n]*[A-Za-zÀ-ÿ.!?])\s*</g;
// Texte en dur dans une expression JSX : {cond ? 'Texte' : 'Autre'} ou {'Texte'}.
const JSX_EXPR_TEXT = /[{?:]\s*['"]([A-ZÀ-Ý][a-zà-ÿ]+(?:[ -][A-Za-zÀ-ÿ'’]+)*)['"]\s*[}:]/g;
const ALERT_TEXT = /Alert\.alert\(\s*['"`]([^'"`]*[A-Za-zÀ-ÿ]{3,}[^'"`]*)['"`]/g;
const IGNORED = [/src\/api\/mock\//, /src\/legal\/content\//, /\.test\.tsx?$/];
for (const file of files.filter((f) => f.endsWith('.tsx') && !IGNORED.some((re) => re.test(f)))) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  for (const re of [UI_PROPS, JSX_TEXT, JSX_EXPR_TEXT, ALERT_TEXT]) {
    for (const m of content.matchAll(re)) {
      const text = (m[2] ?? m[1]).trim();
      if (!text || /^[A-Z0-9_]+$/.test(text) || /^(Promise|Record|Array|Partial|Pick|Omit|Set|Map|ReturnType)$/.test(text)) continue;
      const line = content.slice(0, m.index).split('\n').length;
      report.HARDCODED_UI_TEXT.push(`${rel}:${line} « ${text} »`);
    }
  }
}

const strict = process.argv.includes('--strict');
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [name, items] of Object.entries(report)) {
    const level = name === 'UNUSED_KEYS' && !strict ? 'avertissement' : 'erreur';
    console.log(`\n${name} — ${items.length} ${items.length ? `(${level})` : ''}`);
    for (const item of items.slice(0, 200)) console.log(`  - ${item}`);
  }
}
const errors = Object.entries(report).filter(([name, items]) => items.length && (strict || name !== 'UNUSED_KEYS'));
process.exit(errors.length ? 1 : 0);
