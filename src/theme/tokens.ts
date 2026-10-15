/**
 * Design tokens — CDC_1_Application_Mobile.docx §3 (Identité visuelle et système de design).
 * Source de vérité unique pour couleurs, typographie, rayons et espacements.
 *
 * Les couleurs existent en deux palettes de mêmes clés (clair / sombre). Les
 * écrans n'importent jamais une palette directement : ils passent par
 * `useTheme()` ou `makeStyles()` (src/theme/theme.ts), qui choisissent la palette
 * selon la préférence de l'utilisateur (Réglages → Apparence).
 *
 * Rôle sémantique de chaque clé :
 * - surface        fond d'écran
 * - card           fond des cartes, champs, feuilles (bottom sheets)
 * - surfaceChip    fond neutre des puces / éléments inactifs
 * - surfaceAlt     fond teinté marque (aperçus, encarts)
 * - border         bordures et séparateurs
 * - ink            texte principal
 * - slate          texte secondaire
 * - muted          texte tertiaire, icônes inactives, libellés d'aide
 * - primary        remplissage de marque (boutons, puces actives) — texte `onPrimary` dessus
 * - primaryDark    remplissage pressé / variante foncée
 * - accent         marque utilisée comme texte ou icône sur `surface`/`card` (liens, onglet actif)
 * - onPrimary      texte / icône posé sur un remplissage coloré (primary, *Fill)
 * - veille / prealerte / urgence / disparition   couleur d'état en texte, icône, jauge
 * - *Surface       fond teinté d'un état (badges, bandeaux)
 * - *Fill          remplissage plein d'un état (en-tête d'urgence, bouton danger) — texte `onPrimary`
 * - onWarning      texte posé sur `prealerteFill`
 * - overlay        voile derrière les modales
 */

export interface Palette {
  primary: string;
  primaryDark: string;
  accent: string;
  onPrimary: string;
  ink: string;
  slate: string;
  muted: string;
  veille: string;
  veilleSurface: string;
  veilleFill: string;
  prealerte: string;
  prealerteSurface: string;
  prealerteFill: string;
  onWarning: string;
  urgence: string;
  urgenceSurface: string;
  urgenceFill: string;
  disparition: string;
  disparitionFill: string;
  surface: string;
  card: string;
  surfaceAlt: string;
  surfaceChip: string;
  border: string;
  overlay: string;
}

export const lightColors: Palette = {
  primary: '#D32F2E',
  primaryDark: '#9E1F1E',
  accent: '#D32F2E',
  onPrimary: '#FFFFFF',
  ink: '#1B1B1B',
  slate: '#3A3A3A',
  muted: '#6F6C65',
  // Texte d'état sur fond teinté : assombri pour le contraste AA (4,5:1) ; les remplissages gardent la teinte d'origine.
  veille: '#27704A',
  veilleSurface: '#E8F5EE',
  veilleFill: '#2E7D52',
  prealerte: '#9A5B00',
  prealerteSurface: '#FDF1E0',
  prealerteFill: '#E08A00',
  onWarning: '#1B1B1B',
  urgence: '#C62828',
  urgenceSurface: '#FBE9E9',
  urgenceFill: '#D32F2E',
  disparition: '#9E1F1E',
  disparitionFill: '#9E1F1E',
  surface: '#FBFAF8',
  card: '#FFFFFF',
  surfaceAlt: '#FBE9E9',
  surfaceChip: '#F0EDE8',
  border: '#D9D4CC',
  overlay: 'rgba(27,27,27,0.55)',
};

/**
 * Palette sombre : contrastes AA vérifiés pour le texte (ink/slate/muted sur
 * surface et card ≥ 4,5:1 ; onPrimary sur primary et *Fill ≥ 4,5:1). Les
 * couleurs d'état en texte sont éclaircies ; les remplissages restent foncés
 * pour garder un texte blanc lisible. L'urgence reste rouge dans les deux modes.
 */
export const darkColors: Palette = {
  primary: '#C62828',
  primaryDark: '#8E1B1B',
  accent: '#FF7A73',
  onPrimary: '#FFFFFF',
  ink: '#F2F0EC',
  slate: '#D6D2CB',
  muted: '#A8A39A',
  veille: '#6CCB94',
  veilleSurface: '#15301F',
  veilleFill: '#2E7D52',
  prealerte: '#FFB547',
  prealerteSurface: '#3A2A10',
  prealerteFill: '#E08A00',
  onWarning: '#1B1B1B',
  urgence: '#FF7A73',
  urgenceSurface: '#3B1818',
  urgenceFill: '#C62828',
  disparition: '#FF9E99',
  disparitionFill: '#8E1B1B',
  surface: '#121212',
  card: '#1E1E1E',
  surfaceAlt: '#3B1818',
  surfaceChip: '#2A2A2A',
  border: '#3A3A3A',
  overlay: 'rgba(0,0,0,0.7)',
};

export type RiskColorKey = 'veille' | 'prealerte' | 'urgence' | 'disparition';

/** Couleurs d'un état de risque dans la palette donnée (libellé : i18n `states.*`). */
export function riskColorsFor(palette: Palette, state: RiskColorKey): { fg: string; bg: string } {
  switch (state) {
    case 'veille':
      return { fg: palette.veille, bg: palette.veilleSurface };
    case 'prealerte':
      return { fg: palette.prealerte, bg: palette.prealerteSurface };
    case 'urgence':
      return { fg: palette.urgence, bg: palette.urgenceSurface };
    case 'disparition':
      return { fg: palette.disparition, bg: palette.urgenceSurface };
  }
}

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const typography = {
  display: { fontSize: 32, fontWeight: '700' as const, lineHeight: 40 },
  title1: { fontSize: 24, fontWeight: '700' as const, lineHeight: 30 },
  title2: { fontSize: 20, fontWeight: '600' as const, lineHeight: 26 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  button: { fontSize: 16, fontWeight: '600' as const, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
};

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
};

/** Cible tactile minimale (CDC §8 : ≥ 48 px). */
export const touchTarget = { min: 48 };

export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};
