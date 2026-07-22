/**
 * Design tokens — CDC_1_Application_Mobile.docx §3 (Identité visuelle et système de design).
 * Source de vérité unique pour couleurs, typographie, rayons et espacements.
 */

export const colors = {
  primary: '#D32F2E',
  primaryDark: '#9E1F1E',
  ink: '#1B1B1B',
  slate: '#3A3A3A',
  muted: '#7A776F',
  veille: '#2E7D52',
  veilleSurface: '#E8F5EE',
  prealerte: '#E08A00',
  prealerteSurface: '#FDF1E0',
  urgence: '#D32F2E',
  urgenceSurface: '#FBE9E9',
  disparition: '#9E1F1E',
  surface: '#FBFAF8',
  surfaceAlt: '#FBE9E9',
  border: '#D9D4CC',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(27,27,27,0.55)',
} as const;

export type RiskColorKey = 'veille' | 'prealerte' | 'urgence' | 'disparition';

export const riskColors: Record<RiskColorKey, { fg: string; bg: string; label: string }> = {
  veille: { fg: colors.veille, bg: colors.veilleSurface, label: 'Veille' },
  prealerte: { fg: colors.prealerte, bg: colors.prealerteSurface, label: 'Pré-alerte' },
  urgence: { fg: colors.urgence, bg: colors.urgenceSurface, label: 'Urgence' },
  disparition: { fg: colors.disparition, bg: colors.urgenceSurface, label: 'Disparition' },
};

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
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  floating: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
};

export const touchTarget = { min: 48 };

export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};
