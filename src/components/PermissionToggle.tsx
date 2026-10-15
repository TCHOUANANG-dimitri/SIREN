import React from 'react';
import { Switch, Text, View } from 'react-native';
import { fontFamily, spacing, typography, makeStyles, useTheme } from '@/theme';

interface PermissionToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function PermissionToggle({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: PermissionToggleProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.onPrimary}
        accessibilityLabel={label}
        accessibilityRole="switch"
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  textCol: { flex: 1 },
  label: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  description: { ...typography.caption, color: colors.muted, marginTop: 2 },
}));
