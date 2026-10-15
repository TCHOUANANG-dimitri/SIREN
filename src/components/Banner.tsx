import React from 'react';
import { Text, View } from 'react-native';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react-native';
import { fontFamily, radii, spacing, typography, makeStyles, useTheme, type Palette } from '@/theme';

type BannerKind = 'info' | 'success' | 'error' | 'warning';

interface BannerProps {
  kind?: BannerKind;
  message: string;
}

function kindConfig(colors: Palette, kind: BannerKind): { bg: string; fg: string; Icon: typeof Info } {
  switch (kind) {
    case 'info':
      return { bg: colors.surfaceAlt, fg: colors.accent, Icon: Info };
    case 'success':
      return { bg: colors.veilleSurface, fg: colors.veille, Icon: CheckCircle2 };
    case 'error':
      return { bg: colors.urgenceSurface, fg: colors.urgence, Icon: AlertCircle };
    case 'warning':
      return { bg: colors.prealerteSurface, fg: colors.prealerte, Icon: TriangleAlert };
  }
}

export function Banner({ kind = 'info', message }: BannerProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { bg, fg, Icon } = kindConfig(colors, kind);
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Icon size={16} color={fg} style={styles.icon} />
      <Text style={[styles.text, { color: fg }]}>{message}</Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  icon: { marginTop: 2 },
  text: { ...typography.caption, fontFamily: fontFamily.regular, flex: 1, lineHeight: 18 },
}));
