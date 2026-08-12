import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, MailCheck } from 'lucide-react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button, TextField } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useForgotPassword } from '@/api/hooks/useAuth';

const schema = z.object({ email: z.string().email('Adresse email invalide') });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const forgotPassword = useForgotPassword();
  const [sent, setSent] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: 'onChange', defaultValues: { email: '' } });

  async function onSubmit(values: FormValues) {
    await forgotPassword.mutateAsync(values.email);
    setSent(true);
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.successContainer} edges={['top']}>
        <View style={styles.successIcon}>
          <MailCheck size={40} color={colors.veille} />
        </View>
        <Text style={styles.successTitle}>Lien envoyé !</Text>
        <Text style={styles.successBody}>
          Si un compte existe pour cette adresse, vous recevrez un lien de réinitialisation.
        </Text>
        <Button label={t('auth.login')} onPress={() => router.replace('/(auth)/login')} />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
        <ArrowLeft size={18} color={colors.primary} />
        <Text style={styles.backText}>{t('common.back')}</Text>
      </Pressable>

      <Text style={styles.title}>{t('auth.forgotTitle')}</Text>
      <Text style={styles.subtitle}>
        Indiquez votre adresse email, nous vous enverrons un lien pour réinitialiser votre mot de passe.
      </Text>

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
            placeholder="marie@example.com"
          />
        )}
      />

      <Button
        label={t('auth.sendLink')}
        onPress={handleSubmit(onSubmit)}
        loading={forgotPassword.isPending}
        disabled={!isValid}
      />
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.xxl, paddingTop: spacing.xxxl },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xxl },
  backText: { ...typography.body, fontFamily: fontFamily.medium, color: colors.primary },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.muted, lineHeight: 22, marginBottom: spacing.xxl },
  successContainer: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  successIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.veilleSurface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  successTitle: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  successBody: { ...typography.body, color: colors.muted, textAlign: 'center', marginBottom: spacing.xl },
});
