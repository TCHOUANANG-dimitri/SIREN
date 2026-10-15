import React from 'react';
import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { fontFamily, spacing, typography, makeStyles, useTheme } from '@/theme';

interface ProgressStepsProps {
  steps: string[];
  currentIndex: number;
}

export function ProgressSteps({ steps, currentIndex }: ProgressStepsProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const circleColor = done ? colors.veille : active ? colors.primary : colors.border;
        return (
          <React.Fragment key={step}>
            <View style={styles.stepCol}>
              <View style={[styles.circle, { backgroundColor: circleColor }]}>
                {done ? (
                  <Check size={14} color={colors.onPrimary} strokeWidth={2.5} />
                ) : (
                  <Text style={[styles.circleLabel, { color: active ? colors.onPrimary : colors.muted }]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  { color: done ? colors.veille : active ? colors.accent : colors.muted },
                ]}
                numberOfLines={1}
              >
                {step}
              </Text>
            </View>
            {index < steps.length - 1 && (
              <View
                style={[styles.connector, { backgroundColor: done ? colors.veille : colors.border }]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  stepCol: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  circleLabel: { ...typography.caption, fontFamily: fontFamily.bold },
  stepLabel: { ...typography.label, fontFamily: fontFamily.semiBold, textAlign: 'center' },
  connector: { flex: 1, height: 2, marginBottom: 14, marginTop: 15 },
}));
