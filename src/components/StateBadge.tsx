import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fontFamily, radii, riskColors, spacing, typography, type RiskColorKey } from '@/theme';

interface StateBadgeProps {
  state: RiskColorKey;
  compact?: boolean;
}

export function StateBadge({ state, compact }: StateBadgeProps) {
  const { fg, bg, label } = riskColors[state];
  return (
    <View style={[styles.badge, { backgroundColor: bg }, compact && styles.compact]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
