import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fontFamily, radii, spacing, touchTarget, typography } from '@/theme';

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
        variantStyles[variant].base,
        fullWidth && styles.fullWidth,
        variant === 'emergency' && styles.emergencySize,
        pressed && !isDisabled && variantStyles[variant].pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles[variant].text.color as string} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            style={[
              styles.label,
              variantStyles[variant].text,
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

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.min,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  fullWidth: { alignSelf: 'stretch' },
  emergencySize: { minHeight: 56, borderRadius: radii.lg },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  label: { ...typography.button, fontFamily: fontFamily.semiBold },
  emergencyLabel: { fontSize: 18 },
  disabled: { opacity: 0.5 },
});

const variantStyles: Record<
  Variant,
  { base: StyleProp<ViewStyle>; pressed: StyleProp<ViewStyle>; text: { color: string } }
> = {
  primary: {
    base: { backgroundColor: colors.primary },
    pressed: { backgroundColor: colors.primaryDark },
    text: { color: colors.white },
  },
  emergency: {
    base: { backgroundColor: colors.urgence },
    pressed: { backgroundColor: colors.primaryDark },
    text: { color: colors.white },
  },
  secondary: {
    base: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
    pressed: { backgroundColor: colors.surfaceAlt },
    text: { color: colors.primary },
  },
  ghost: {
    base: { backgroundColor: 'transparent' },
    pressed: { backgroundColor: colors.surfaceAlt },
    text: { color: colors.muted },
  },
};
