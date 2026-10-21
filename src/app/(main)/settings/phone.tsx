import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button, TextField } from '@/components';
import { fontFamily, makeStyles, spacing, typography, useTheme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useConfirmPhoneChange, useLogout, useRequestPhoneChange } from '@/api/hooks/useAuth';
import { toUserMessage } from '@/api/errors';
import { isPlausiblePhone, maskPhone, normalizePhoneInput } from '@/features/auth/phone';
import { isCompleteOtp, normalizeOtpInput, OTP_CODE_LENGTH } from '@/features/auth/otpCode';
import { ChannelPicker } from '@/features/auth/ChannelPicker';

type Feedback = { kind: 'success' | 'error'; message: string } | null;
const PHONE_CHANNELS = ['sms', 'whatsapp'] as const;

/**
 * Changement (ou ajout, pour un compte ancien sans numéro) du téléphone.
 * 1. mot de passe actuel + nouveau numéro → le serveur vérifie le mot de passe
 *    et envoie un code au NOUVEAU numéro (SMS ou WhatsApp) ;
 * 2. le code saisi prouve la possession du numéro : alors seulement le compte est
 *    modifié, et l'ancien numéro est prévenu par le serveur.
 * Aucun succès n'est affiché avant la confirmation du serveur.
 */
export default function PhoneScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const online = useUiStore((s) => s.deviceOnline);
  const requestChange = useRequestPhoneChange();
  const confirmChange = useConfirmPhoneChange();
  const logout = useLogout();
  const [password, setPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const [channel, setChannel] = useState<(typeof PHONE_CHANNELS)[number]>('sms');
  const [challenge, setChallenge] = useState<{ token: string; devHint?: string } | null>(null);
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const mustComplete = !!user?.phoneRequired;

  async function sendCode() {
    setFeedback(null);
    if (!isPlausiblePhone(newPhone)) {
      setPhoneError(t('validation.phoneInvalid'));
      return;
    }
    setPhoneError(undefined);
    try {
      const result = await requestChange.mutateAsync({ currentPassword: password, newPhone, channel });
      setChallenge({ token: result.challengeToken as string, devHint: result.devHint });
      setCode('');
    } catch (e) {
      setFeedback({ kind: 'error', message: toUserMessage(e) });
    }
  }

  async function confirm() {
    if (!challenge) return;
    setFeedback(null);
    try {
      await confirmChange.mutateAsync({ challengeToken: challenge.token, code });
      setChallenge(null);
      setPassword('');
      setNewPhone('');
      setFeedback({ kind: 'success', message: t('settings.phone.changed') });
      if (mustComplete) router.replace('/(main)/(tabs)');
    } catch (e) {
      setFeedback({ kind: 'error', message: toUserMessage(e) });
      setCode('');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!mustComplete && (
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.back')}>
              <ArrowLeft size={20} color={colors.ink} />
            </Pressable>
          )}
          <Text style={styles.title} accessibilityRole="header">
            {t(mustComplete ? 'settings.phone.completeTitle' : 'settings.phone.title')}
          </Text>
          <Text style={styles.help}>{t(mustComplete ? 'settings.phone.completeBody' : 'settings.phone.body')}</Text>
          {user?.telephone ? (
            <Text style={styles.current}>{t('settings.phone.current', { phone: user.telephone })}</Text>
          ) : null}

          {!online && <Banner kind="warning" message={t('settings.security.offline')} />}
          {feedback && (
            <View style={styles.feedback}>
              <Banner kind={feedback.kind} message={feedback.message} />
            </View>
          )}

          {!challenge ? (
            <View>
              <TextField
                label={t('settings.phone.newPhone')}
                value={newPhone}
                onChangeText={(v) => {
                  setNewPhone(v);
                  if (phoneError) setPhoneError(undefined);
                }}
                error={phoneError}
                hint={t('auth.phoneHint')}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder={t('auth.phonePlaceholder')}
              />
              <TextField
                label={t('settings.security.currentPassword')}
                value={password}
                onChangeText={setPassword}
                secureToggle
                autoCapitalize="none"
              />
              <ChannelPicker channels={[...PHONE_CHANNELS]} value={channel} onChange={(c) => setChannel(c as typeof channel)} />
              <Button
                label={t('settings.phone.sendCode')}
                onPress={sendCode}
                loading={requestChange.isPending}
                disabled={!online || !password || !newPhone.trim()}
              />
            </View>
          ) : (
            <View>
              <Text style={styles.help}>
                {t('settings.phone.codeSent', { channel: t(`auth.channels.${channel}`), phone: maskPhone(normalizePhoneInput(newPhone)) })}
              </Text>
              <TextField
                label={t('auth.codeLabel')}
                value={code}
                onChangeText={(v) => setCode(normalizeOtpInput(v))}
                autoCapitalize="characters"
                autoCorrect={false}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={OTP_CODE_LENGTH + 4}
              />
              {challenge.devHint ? <Text style={styles.devHint}>{t('auth.devHint', { code: challenge.devHint })}</Text> : null}
              <Button
                label={t('settings.phone.confirm')}
                onPress={confirm}
                loading={confirmChange.isPending}
                disabled={!online || !isCompleteOtp(code)}
              />
              <Button
                label={t('settings.phone.restart')}
                variant="ghost"
                onPress={() => {
                  setChallenge(null);
                  setCode('');
                  setFeedback(null);
                }}
                style={styles.secondary}
              />
            </View>
          )}
          {mustComplete && (
            // Écran imposé sans retour possible : la déconnexion reste toujours offerte
            // (ex. aucun canal SMS / WhatsApp configuré côté serveur).
            <Button
              label={t('settings.logout')}
              variant="ghost"
              onPress={() => logout.mutate()}
              loading={logout.isPending}
              style={styles.secondary}
              testID="phone-complete-logout"
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: spacing.xxxl },
  back: { minHeight: 44, minWidth: 44, justifyContent: 'center', marginBottom: spacing.md },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.sm },
  help: { ...typography.body, color: colors.muted, marginBottom: spacing.lg },
  current: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.lg },
  feedback: { marginBottom: spacing.lg },
  devHint: { ...typography.caption, color: colors.ink, marginBottom: spacing.md },
  secondary: { marginTop: spacing.md },
}));
