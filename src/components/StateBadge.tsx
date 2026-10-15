import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fontFamily, radii, riskColorsFor, spacing, typography, type RiskColorKey, makeStyles, useTheme } from '@/theme';

interface StateBadgeProps {
  state: RiskColorKey;
  compact?: boolean;
}

export function StateBadge({ state, compact }: StateBadgeProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { fg, bg } = riskColorsFor(colors, state);
  const label = t(`riskState.${state}`);
  return (
    <View style={[styles.badge, { backgroundColor: bg }, compact && styles.compact]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  compact: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { ...typography.label, fontFamily: fontFamily.semiBold },
}));
