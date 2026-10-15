import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Banner, Button, PasswordStrengthMeter, SettingsRow, SettingsSection, TextField } from '@/components';
import { fontFamily, makeStyles, spacing, touchTarget, typography, useTheme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useChangePassword, useSetTwoFactor } from '@/api/hooks/useAuth';
import { toUserMessage } from '@/api/errors';
import { passwordSchema } from '@/features/auth/passwordPolicy';

const passwordForm = z
  .object({
    currentPassword: z.string().min(1, 'validation.required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'validation.passwordMismatch', path: ['confirmPassword'] })
  .refine((d) => d.newPassword !== d.currentPassword, { message: 'validation.passwordUnchanged', path: ['newPassword'] });
type PasswordValues = z.infer<typeof passwordForm>;

type Feedback = { kind: 'success' | 'error'; message: string } | null;

/**
 * Sécurité du compte : mot de passe et vérification en deux étapes (code par email).
 * Chaque action exige le mot de passe actuel et n'affiche un succès qu'après
 * confirmation du serveur ; hors connexion, elles sont désactivées.
 */
export default function SecurityScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const online = useUiStore((s) => s.deviceOnline);
  const changePassword = useChangePassword();
  const setTwoFactor = useSetTwoFactor();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [twofaTarget, setTwofaTarget] = useState<boolean | null>(null);
  const [twofaPassword, setTwofaPassword] = useState('');

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordForm),
    mode: 'onChange',
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  async function submitPassword(values: PasswordValues) {
    setFeedback(null);
    try {
      await changePassword.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      reset();
      setFeedback({ kind: 'success', message: t('settings.security.passwordChanged') });
    } catch (e) {
      setFeedback({ kind: 'error', message: toUserMessage(e) });
    }
  }

  async function confirmTwofa() {
    if (twofaTarget === null) return;
    setFeedback(null);
    try {
      await setTwoFactor.mutateAsync({ enabled: twofaTarget, password: twofaPassword });
      setFeedback({ kind: 'success', message: t(twofaTarget ? 'settings.security.twofaEnabled' : 'settings.security.twofaDisabled') });
      setTwofaTarget(null);
      setTwofaPassword('');
    } catch (e) {
      setFeedback({ kind: 'error', message: toUserMessage(e) });
    }
  }

  const twofaOn = !!user?.twofaEnabled;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">{t('settings.security.title')}</Text>

          {!online && <Banner kind="warning" message={t('settings.security.offline')} />}
          {feedback && (
            <View style={styles.feedback}>
              <Banner kind={feedback.kind} message={feedback.message} />
            </View>
          )}

          <SettingsSection title={t('settings.security.twofaTitle')} footer={t('settings.security.twofaFooter', { email: user?.email ?? '' })}>
            <SettingsRow
              icon={ShieldCheck}
              label={t('settings.security.twofaLabel')}
              description={twofaOn ? t('settings.security.twofaOn') : t('settings.security.twofaOff')}
              trailing={
                <Switch
                  value={twofaTarget ?? twofaOn}
                  disabled={!online || setTwoFactor.isPending}
                  onValueChange={(next) => {
                    setFeedback(null);
                    setTwofaPassword('');
                    setTwofaTarget(next === twofaOn ? null : next);
                  }}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.onPrimary}
                  accessibilityLabel={t('settings.security.twofaLabel')}
                />
              }
            />
            {twofaTarget !== null && (
              <View style={styles.form}>
                <Text style={styles.help}>
                  {t(twofaTarget ? 'settings.security.twofaConfirmEnable' : 'settings.security.twofaConfirmDisable')}
                </Text>
                <TextField
                  label={t('settings.security.currentPassword')}
                  value={twofaPassword}
                  onChangeText={setTwofaPassword}
                  secureToggle
                  autoCapitalize="none"
                />
                <View style={styles.row}>
                  <Button label={t('common.cancel')} variant="ghost" fullWidth={false} style={styles.flex} onPress={() => setTwofaTarget(null)} />
                  <Button
                    label={t('common.confirm')}
                    fullWidth={false}
                    style={styles.flex}
                    onPress={confirmTwofa}
                    loading={setTwoFactor.isPending}
                    disabled={twofaPassword.length === 0 || !online}
                  />
                </View>
              </View>
            )}
          </SettingsSection>

          <SettingsSection title={t('settings.security.passwordTitle')} footer={t('settings.security.passwordFooter')}>
            <View style={styles.form}>
              <Controller
                control={control}
                name="currentPassword"
                render={({ field }) => (
                  <TextField
                    label={t('settings.security.currentPassword')}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.currentPassword?.message && t(errors.currentPassword.message)}
                    secureToggle
                    autoCapitalize="none"
                  />
                )}
              />
              <Controller
                control={control}
                name="newPassword"
                render={({ field }) => (
                  <>
                    <TextField
                      label={t('auth.newPassword')}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={errors.newPassword?.message && t(errors.newPassword.message)}
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
                label={t('settings.security.changePassword')}
                onPress={handleSubmit(submitPassword)}
                loading={changePassword.isPending}
                disabled={!isValid || !online}
              />
            </View>
          </SettingsSection>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  back: { width: touchTarget.min, height: touchTarget.min, justifyContent: 'center', marginLeft: -spacing.sm },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.lg },
  feedback: { marginVertical: spacing.md },
  form: { padding: spacing.lg, gap: spacing.xs },
  help: { ...typography.caption, color: colors.slate, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
}));
