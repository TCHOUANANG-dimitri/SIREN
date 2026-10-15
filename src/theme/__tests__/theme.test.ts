import { darkColors, lightColors, type Palette } from '../tokens';
import { resolveScheme } from '../theme';

/** Rapport de contraste WCAG 2.1 entre deux couleurs #RRGGBB. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('thème', () => {
  it('le choix explicite l’emporte sur le téléphone ; « système » suit le téléphone', () => {
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('light');
  });

  it('les deux palettes ont exactement les mêmes clés', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  describe.each([
    ['clair', lightColors],
    ['sombre', darkColors],
  ] as [string, Palette][])('contrastes AA (%s)', (_name, c) => {
    it.each([
      ['ink/surface', c.ink, c.surface],
      ['ink/card', c.ink, c.card],
      ['slate/card', c.slate, c.card],
      ['muted/surface', c.muted, c.surface],
      ['muted/card', c.muted, c.card],
      ['accent/surface', c.accent, c.surface],
      ['accent/card', c.accent, c.card],
      ['onPrimary/primary', c.onPrimary, c.primary],
      ['onPrimary/urgenceFill', c.onPrimary, c.urgenceFill],
      ['onPrimary/disparitionFill', c.onPrimary, c.disparitionFill],
      ['onWarning/prealerteFill', c.onWarning, c.prealerteFill],
      ['urgence/urgenceSurface', c.urgence, c.urgenceSurface],
      ['prealerte/prealerteSurface', c.prealerte, c.prealerteSurface],
      ['veille/veilleSurface', c.veille, c.veilleSurface],
    ])('%s ≥ 4,5:1', (_pair, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
