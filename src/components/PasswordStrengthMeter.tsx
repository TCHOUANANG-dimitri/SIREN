import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';

function scorePassword(password: string): number {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

const labels = ['Trop faible', 'Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'];
const colorsByScore = [colors.urgence, colors.urgence, colors.urgence, colors.prealerte, colors.veille, colors.veille];

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = scorePassword(password);

  return (
    <View style={styles.wrapper}>
      <View style={styles.bars}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[styles.bar, { backgroundColor: i < score ? colorsByScore[score] : colors.border }]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color: colorsByScore[score] }]}>{labels[score]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: -spacing.sm, marginBottom: spacing.md },
  bars: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  bar: { flex: 1, height: 4, borderRadius: radii.sm },
  label: { ...typography.caption, fontFamily: fontFamily.medium },
});
