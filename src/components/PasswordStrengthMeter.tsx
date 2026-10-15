import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fontFamily, radii, spacing, typography, makeStyles, useTheme } from '@/theme';
import { passwordScore } from '@/features/auth/passwordPolicy';

const labelKeys = ['veryWeak', 'veryWeak', 'weak', 'medium', 'good', 'excellent'];
const toneByScore = ['urgence', 'urgence', 'urgence', 'prealerte', 'veille', 'veille'] as const;

export function PasswordStrengthMeter({ password }: { password: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (!password) return null;
  const score = passwordScore(password);
  const scoreColor = colors[toneByScore[score]];

  return (
    <View style={styles.wrapper}>
      <View style={styles.bars}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[styles.bar, { backgroundColor: i < score ? scoreColor : colors.border }]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color: scoreColor }]}>{t(`passwordStrength.${labelKeys[score]}`)}</Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrapper: { marginTop: -spacing.sm, marginBottom: spacing.md },
  bars: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  bar: { flex: 1, height: 4, borderRadius: radii.sm },
  label: { ...typography.caption, fontFamily: fontFamily.medium },
}));
