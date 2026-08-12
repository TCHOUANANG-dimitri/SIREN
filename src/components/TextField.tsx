import React, { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
  secureToggle?: boolean;
  required?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, secureToggle, required, secureTextEntry, ...inputProps },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);

  const borderColor = error ? colors.urgence : focused ? colors.primary : colors.border;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        {required === false && <Text style={styles.optional}> (optionnel)</Text>}
      </Text>
      <View style={[styles.inputRow, { borderColor, borderWidth: focused || error ? 1.5 : 1 }]}>
        <TextInput
          ref={ref}
          style={styles.input}
          placeholderTextColor={colors.muted}
          secureTextEntry={secureToggle ? hidden : secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          accessibilityLabel={label}
          {...inputProps}
        />
        {secureToggle && (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Afficher le mot de passe' : 'Masquer le mot de passe'}
            hitSlop={8}
          >
            {hidden ? (
              <Eye size={20} color={colors.muted} />
            ) : (
              <EyeOff size={20} color={colors.muted} />
            )}
          </Pressable>
        )}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md, maxWidth: 680, width: '100%', alignSelf: 'center' },
  label: {
    ...typography.label,
    fontFamily: fontFamily.semiBold,
    color: colors.slate,
    marginBottom: spacing.xs + 2,
  },
  optional: { fontFamily: fontFamily.regular, color: colors.muted },
  inputRow: {
    borderRadius: radii.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  input: {
    flex: 1,
    ...typography.body,
    fontFamily: fontFamily.regular,
    color: colors.ink,
    paddingVertical: spacing.sm,
  },
  error: { ...typography.caption, color: colors.urgence, marginTop: spacing.xs },
  hint: { ...typography.caption, color: colors.muted, marginTop: spacing.xs },
});
