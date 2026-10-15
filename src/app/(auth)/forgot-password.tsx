import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Banner, Button, TextField } from '@/components';
import { fontFamily, spacing, typography, makeStyles, useTheme } from '@/theme';
import { useForgotPassword } from '@/api/hooks/useAuth';
import { toUserMessage } from '@/api/errors';

const schema = z.object({ email: z.string().trim().email('validation.emailInvalid') });
type FormValues = z.infer<typeof schema>;

/**
 * Mot de passe oublié, étape 1. Le serveur envoie un code par email si un compte
 * existe ; la réponse est la même sinon (on ne révèle pas quels emails ont un compte).
 * Sans canal email configuré, le serveur le dit : aucun faux « email envoyé ».
 */
export default function ForgotPasswordScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const forgotPassword = useForgotPassword();
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: 'onChange', defaultValues: { email: '' } });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await forgotPassword.mutateAsync(values.email);
      router.push('/(auth)/reset-password');
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={12} accessibilityRole="button">
          <ArrowLeft size={18} color={colors.accent} />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>

        <Text style={styles.title} accessibilityRole="header">{t('auth.forgotTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.forgotBody')}</Text>

        {error && <Banner kind="error" message={error} />}

        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <TextField
              label={t('auth.email')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.email?.message && t(errors.email.message)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder={t('auth.emailPlaceholder')}
            />
          )}
        />

        <Button
          label={t('auth.sendCode')}
          onPress={handleSubmit(onSubmit)}
          loading={forgotPassword.isPending}
          disabled={!isValid}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.xxl, paddingTop: spacing.xxxl, gap: spacing.sm },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl, minHeight: 44 },
  backText: { ...typography.body, fontFamily: fontFamily.medium, color: colors.accent },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  subtitle: { ...typography.body, color: colors.muted, lineHeight: 22, marginBottom: spacing.lg },
}));
