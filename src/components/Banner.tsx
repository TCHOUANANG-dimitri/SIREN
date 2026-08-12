import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react-native';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';

type BannerKind = 'info' | 'success' | 'error' | 'warning';

interface BannerProps {
  kind?: BannerKind;
  message: string;
}

const kindConfig: Record<BannerKind, { bg: string; fg: string; Icon: typeof Info }> = {
  info: { bg: colors.surfaceAlt, fg: colors.primary, Icon: Info },
  success: { bg: colors.veilleSurface, fg: colors.veille, Icon: CheckCircle2 },
  error: { bg: colors.urgenceSurface, fg: colors.urgence, Icon: AlertCircle },
  warning: { bg: colors.prealerteSurface, fg: colors.prealerte, Icon: TriangleAlert },
};

export function Banner({ kind = 'info', message }: BannerProps) {
  const { bg, fg, Icon } = kindConfig[kind];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Icon size={16} color={fg} style={styles.icon} />
      <Text style={[styles.text, { color: fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  icon: { marginTop: 2 },
  text: { ...typography.caption, fontFamily: fontFamily.regular, flex: 1, lineHeight: 18 },
});
