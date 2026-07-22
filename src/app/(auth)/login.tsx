import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Banner, Button, TextField } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useLogin } from '@/api/hooks/useAuth';
import { ApiError } from '@/api/network';

const schema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const { t } = useTranslation();
  const login = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await login.mutateAsync(values);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : t('auth.invalidCredentials'));
    }
  }

  function fillDemo(email: string) {
    setValue('email', email, { shouldValidate: true });
    setValue('password', 'Password123!', { shouldValidate: true });
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Image source={require('../../../assets/images/image.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.title}>{t('auth.welcomeBack')}</Text>
        <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>

        {serverError && (
          <View style={{ marginBottom: spacing.md }}>
            <Banner kind="error" message={serverError} />
          </View>
        )}

        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <TextField
              label={t('auth.email')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.email?.message}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="marie@example.com"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <TextField
              label={t('auth.password')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.password?.message}
              secureToggle
              autoCapitalize="none"
              autoComplete="password"
            />
          )}
        />

        <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
          <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
        </Link>

        <Button
          label={t('auth.login')}
          onPress={handleSubmit(onSubmit)}
          loading={login.isPending}
          disabled={!isValid}
          style={{ marginBottom: spacing.xl }}
        />

        <View style={styles.demoBox}>
          <Text style={styles.demoTitle}>Démo — comptes pré-configurés</Text>
          <Text style={styles.demoLine} onPress={() => fillDemo('marie@example.com')}>
            👩 Marie (principal) — marie@example.com
          </Text>
          <Text style={styles.demoLine} onPress={() => fillDemo('rose@example.com')}>
            👵 Rose (secondaire) — rose@example.com
          </Text>
          <Text style={styles.demoHint}>Mot de passe : Password123! (pré-rempli au tap)</Text>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
          <Link href="/(auth)/register">
            <Text style={styles.footerLink}>{t('auth.createAccount')}</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: spacing.xxl, paddingTop: spacing.xxxl },
  logoWrap: { alignItems: 'center', marginBottom: spacing.xxl },
  logo: { width: 90, height: 90 },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.muted, marginBottom: spacing.xxl },
  forgotLink: { alignSelf: 'flex-end', marginBottom: spacing.xxl, marginTop: -spacing.xs },
  forgotText: { ...typography.body, fontFamily: fontFamily.medium, color: colors.primary },
  demoBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: spacing.md,
    gap: 4,
    marginBottom: spacing.xl,
  },
  demoTitle: { ...typography.label, fontFamily: fontFamily.semiBold, color: colors.primaryDark, marginBottom: 4 },
  demoLine: { ...typography.caption, fontFamily: fontFamily.medium, color: colors.slate },
  demoHint: { ...typography.caption, color: colors.muted, marginTop: 2 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  footerText: { ...typography.body, color: colors.slate },
  footerLink: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.primary },
});
