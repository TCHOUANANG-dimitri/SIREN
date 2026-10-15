import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { fontFamily, radii, spacing, touchTarget, typography, makeStyles } from '@/theme';

type Variant = 'primary' | 'secondary' | 'emergency' | 'ghost';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const styles = useStyles();
  const variantStyles = useVariantStyles();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base,
        variantStyles[`${variant}Base`],
        fullWidth && styles.fullWidth,
        variant === 'emergency' && styles.emergencySize,
        pressed && !isDisabled && variantStyles[`${variant}Pressed`],
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles[`${variant}Text`].color} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            style={[
              styles.label,
              variantStyles[`${variant}Text`],
              variant === 'emergency' && styles.emergencyLabel,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  base: {
    minHeight: touchTarget.min,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  fullWidth: { alignSelf: 'center', width: '100%', maxWidth: 680 },
  emergencySize: { minHeight: 56, borderRadius: radii.lg },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  label: { ...typography.button, fontFamily: fontFamily.semiBold },
  emergencyLabel: { fontSize: 18 },
  disabled: { opacity: 0.5 },
}));

const useVariantStyles = makeStyles((colors) => ({
  primaryBase: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryDark },
  primaryText: { color: colors.onPrimary },
  emergencyBase: { backgroundColor: colors.urgenceFill },
  emergencyPressed: { backgroundColor: colors.primaryDark },
  emergencyText: { color: colors.onPrimary },
  secondaryBase: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
  secondaryPressed: { backgroundColor: colors.surfaceAlt },
  secondaryText: { color: colors.accent },
  ghostBase: { backgroundColor: 'transparent' },
  ghostPressed: { backgroundColor: colors.surfaceAlt },
  ghostText: { color: colors.muted },
}));
