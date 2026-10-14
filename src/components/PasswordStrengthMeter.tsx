import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { passwordScore } from '@/features/auth/passwordPolicy';

const labelKeys = ['veryWeak', 'veryWeak', 'weak', 'medium', 'good', 'excellent'];
const colorsByScore = [colors.urgence, colors.urgence, colors.urgence, colors.prealerte, colors.veille, colors.veille];

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { t } = useTranslation();
  if (!password) return null;
  const score = passwordScore(password);

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
      <Text style={[styles.label, { color: colorsByScore[score] }]}>{t(`passwordStrength.${labelKeys[score]}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: -spacing.sm, marginBottom: spacing.md },
  bars: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  bar: { flex: 1, height: 4, borderRadius: radii.sm },
  label: { ...typography.caption, fontFamily: fontFamily.medium },
});
