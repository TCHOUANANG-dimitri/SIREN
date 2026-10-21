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
import { ChannelPicker } from '@/features/auth/ChannelPicker';
import type { OtpChannel } from '@/api/contracts';

const schema = z.object({ identifier: z.string().trim().min(3, 'validation.identifierRequired') });
type FormValues = z.infer<typeof schema>;
const CHANNELS: OtpChannel[] = ['sms', 'whatsapp', 'email'];

/**
 * Mot de passe oublié, étape 1 : téléphone ou e-mail + canal de réception. Le
 * serveur envoie un code si un compte existe ; la réponse est la même sinon (on ne
 * révèle pas quels comptes existent). L'e-mail n'est utilisable que s'il a été
 * vérifié. Un canal non configuré est signalé : aucun faux « code envoyé ».
 */
export default function ForgotPasswordScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const forgotPassword = useForgotPassword();
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<OtpChannel>('sms');

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: 'onChange', defaultValues: { identifier: '' } });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await forgotPassword.mutateAsync({ identifier: values.identifier, channel });
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
          name="identifier"
          render={({ field }) => (
            <TextField
              label={t('auth.identifier')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.identifier?.message && t(errors.identifier.message)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              placeholder={t('auth.identifierPlaceholder')}
            />
          )}
        />

        <ChannelPicker channels={CHANNELS} value={channel} onChange={setChannel} disabled={forgotPassword.isPending} />

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
