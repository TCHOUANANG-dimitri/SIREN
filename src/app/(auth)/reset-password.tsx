import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Banner, Button, PasswordStrengthMeter, TextField } from '@/components';
import { fontFamily, radii, spacing, typography, makeStyles, useTheme } from '@/theme';
import { useResendOtp, useResetPassword } from '@/api/hooks/useAuth';
import { usePendingAuthStore } from '@/stores/pendingAuthStore';
import { toUserMessage } from '@/api/errors';
import { passwordSchema } from '@/features/auth/passwordPolicy';
import { OTP_CODE_LENGTH, isCompleteOtp, normalizeOtpInput } from '@/features/auth/otpCode';

const RESEND_SECONDS = 60;

const schema = z
  .object({
    code: z.string().trim().refine((v) => isCompleteOtp(v), 'validation.codeFormat'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof schema>;

/** Mot de passe oublié, étape 2 : code reçu par email + nouveau mot de passe. */
export default function ResetPasswordScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { pending, devHint, channel } = usePendingAuthStore();
  const resetPassword = useResetPassword();
  const resend = useResendOtp();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { code: '', password: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await resetPassword.mutateAsync({ code: values.code, newPassword: values.password });
      setDone(true);
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <CheckCircle2 size={48} color={colors.veille} />
        <Text style={styles.title}>{t('auth.resetDoneTitle')}</Text>
        <Text style={styles.centerBody}>{t('auth.resetDoneBody')}</Text>
        <Button label={t('auth.login')} onPress={() => router.replace('/(auth)/login')} />
      </SafeAreaView>
    );
  }

  if (!pending || pending.kind !== 'reset') {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <Banner kind="info" message={t('apiErrors.reasons.challenge_invalid')} />
        <Button label={t('auth.forgotTitle')} onPress={() => router.replace('/(auth)/forgot-password')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={12} accessibilityRole="button">
            <ArrowLeft size={18} color={colors.accent} />
            <Text style={styles.backText}>{t('common.back')}</Text>
          </Pressable>

          <Text style={styles.title} accessibilityRole="header">{t('auth.resetTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.resetSubtitle', { channel: channel ? t(`auth.channels.${channel}`) : '—' })}</Text>

          {error && <Banner kind="error" message={error} />}

          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <TextField
                label={t('auth.codeLabel')}
                value={field.value}
                onChangeText={(v) => field.onChange(normalizeOtpInput(v))}
                onBlur={field.onBlur}
                error={errors.code?.message && t(errors.code.message)}
                autoCapitalize="characters"
                autoCorrect={false}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={OTP_CODE_LENGTH + 4}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <>
                <TextField
                  label={t('auth.newPassword')}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.password?.message && t(errors.password.message)}
                  secureToggle
                  autoCapitalize="none"
                />
                <PasswordStrengthMeter password={field.value} />
              </>
            )}
          />
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field }) => (
              <TextField
                label={t('auth.confirmPassword')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.confirmPassword?.message && t(errors.confirmPassword.message)}
                secureToggle
                autoCapitalize="none"
              />
            )}
          />

          <Button
            label={t('auth.resetSubmit')}
            onPress={handleSubmit(onSubmit)}
            loading={resetPassword.isPending}
            disabled={!isValid}
          />

          <View style={styles.resendRow}>
            {secondsLeft > 0 ? (
              <Text style={styles.muted}>{t('auth.resendIn')} 0:{secondsLeft.toString().padStart(2, '0')}</Text>
            ) : (
              <Text
                style={styles.link}
                accessibilityRole="button"
                onPress={() => {
                  setError(null);
                  resend.mutate(undefined, {
                    onSuccess: () => setSecondsLeft(RESEND_SECONDS),
                    onError: (e) => setError(toUserMessage(e)),
                  });
                }}
              >
                {t('auth.resendCode')}
              </Text>
            )}
          </View>

          {devHint && (
            <View style={styles.devHintBox}>
              <Text style={styles.devHintText}>{t('auth.devHint', { code: devHint })}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xxl, paddingTop: spacing.lg, gap: spacing.xs },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  centerBody: { ...typography.body, color: colors.muted, textAlign: 'center', marginBottom: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl, minHeight: 44 },
  backText: { ...typography.body, fontFamily: fontFamily.medium, color: colors.accent },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  subtitle: { ...typography.body, color: colors.muted, lineHeight: 22, marginBottom: spacing.lg },
  resendRow: { alignItems: 'center', marginTop: spacing.lg },
  muted: { ...typography.body, color: colors.muted },
  link: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.accent, paddingVertical: spacing.sm },
  devHintBox: { marginTop: spacing.xl, backgroundColor: colors.surfaceAlt, borderRadius: radii.md, padding: spacing.md },
  devHintText: { ...typography.caption, color: colors.ink, textAlign: 'center' },
}));
