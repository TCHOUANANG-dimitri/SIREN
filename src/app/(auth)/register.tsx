import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button, PasswordStrengthMeter, TextField } from '@/components';
import { fontFamily, spacing, typography, makeStyles, useTheme } from '@/theme';
import { useRegister } from '@/api/hooks/useAuth';
import { toUserMessage } from '@/api/errors';
import { passwordSchema } from '@/features/auth/passwordPolicy';
import { isPlausiblePhone, normalizePhoneInput } from '@/features/auth/phone';

const schema = z
  .object({
    nom: z.string().trim().min(2, 'validation.nameTooShort'),
    // Téléphone obligatoire (format international, vérifié par le serveur) ; e-mail facultatif.
    telephone: z.string().trim().refine((v) => isPlausiblePhone(v), 'validation.phoneInvalid'),
    email: z.union([z.literal(''), z.string().trim().email('validation.emailInvalid')]),
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  })
  .refine((data) => data.acceptTerms, {
    message: 'validation.termsRequired',
    path: ['acceptTerms'],
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const register = useRegister();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { nom: '', email: '', telephone: '', password: '', confirmPassword: '', acceptTerms: false },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await register.mutateAsync({
        nom: values.nom,
        telephone: normalizePhoneInput(values.telephone),
        email: values.email.trim() || undefined,
        password: values.password,
      });
      if (result.otpRequired) router.push('/(auth)/otp');
    } catch (error) {
      setServerError(toUserMessage(error, t('common.error')));
    }
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
          <ArrowLeft size={18} color={colors.accent} />
          <Text style={styles.backText}>{t('auth.login')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('auth.createAccountTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.createAccountSubtitle')}</Text>

        {serverError && (
          <View style={{ marginBottom: spacing.md }}>
            <Banner kind="error" message={serverError} />
          </View>
        )}

        <Controller
          control={control}
          name="nom"
          render={({ field }) => (
            <TextField
              label={t('auth.fullName')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.nom?.message && t(errors.nom.message)}
              placeholder={t('auth.namePlaceholder')}
            />
          )}
        />
        <Controller
          control={control}
          name="telephone"
          render={({ field }) => (
            <TextField
              label={t('auth.phone')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.telephone?.message && t(errors.telephone.message)}
              hint={t('auth.phoneHint')}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              placeholder={t('auth.phonePlaceholder')}
            />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <TextField
              label={t('auth.email')}
              required={false}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.email?.message && t(errors.email.message)}
              hint={t('auth.emailOptionalHint')}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder={t('auth.emailPlaceholder')}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <>
              <TextField
                label={t('auth.password')}
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

        <Controller
          control={control}
          name="acceptTerms"
          render={({ field }) => (
            <View style={styles.termsBlock}>
              <Pressable
                style={styles.termsRow}
                onPress={() => field.onChange(!field.value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: field.value }}
                accessibilityLabel={t('auth.acceptTermsA11y')}
                hitSlop={8}
              >
                <View style={[styles.checkbox, field.value && styles.checkboxChecked]}>
                  {field.value && <Check size={12} color={colors.onPrimary} strokeWidth={3} />}
                </View>
                <Text style={styles.termsText}>{t('auth.acceptTerms')}</Text>
              </Pressable>
              <View style={styles.termsLinks}>
                <Text
                  style={styles.termsLink}
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
                >
                  {t('legal.docs.terms')}
                </Text>
                <Text
                  style={styles.termsLink}
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
                >
                  {t('legal.docs.privacy')}
                </Text>
              </View>
            </View>
          )}
        />
        {errors.acceptTerms && <Text style={styles.termsError}>{t(errors.acceptTerms.message ?? '')}</Text>}

        <Button
          label={t('auth.createAccountTitle')}
          onPress={handleSubmit(onSubmit)}
          loading={register.isPending}
          disabled={!isValid}
          style={{ marginTop: spacing.md, marginBottom: spacing.lg }}
        />

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>{t('auth.alreadyHaveAccount')} · </Text>
          <Text style={styles.footerLink} onPress={() => router.back()}>
            {t('auth.login')}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: spacing.xxl, paddingTop: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  backText: { ...typography.body, fontFamily: fontFamily.medium, color: colors.accent },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.muted, marginBottom: spacing.xl },
  termsBlock: { marginBottom: spacing.xs },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 32 },
  termsLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginLeft: 28, marginTop: spacing.xs },
  termsLink: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.accent, textDecorationLine: 'underline', paddingVertical: spacing.xs },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  termsText: { ...typography.caption, color: colors.slate, flex: 1, lineHeight: 18 },
  termsError: { ...typography.caption, color: colors.urgence, marginBottom: spacing.md },
  footerRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  footerText: { ...typography.body, color: colors.slate },
  footerLink: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.accent },
}));
