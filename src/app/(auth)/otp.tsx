import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button } from '@/components';
import { fontFamily, radii, spacing, typography, makeStyles, useTheme } from '@/theme';
import { useResendOtp, useVerifyOtp } from '@/api/hooks/useAuth';
import { usePendingAuthStore } from '@/stores/pendingAuthStore';
import { toUserMessage } from '@/api/errors';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function OtpScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { destination, devHint, pending, expiresAt } = usePendingAuthStore();
  const verifyOtp = useVerifyOtp();
  const resendOtp = useResendOtp();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function handleVerify(value: string) {
    // Un code complet déclenche la vérification automatiquement : pas de double envoi.
    if (verifyOtp.isPending) return;
    setError(null);
    try {
      await verifyOtp.mutateAsync(value);
    } catch (e) {
      setError(toUserMessage(e, t('apiErrors.reasons.otp_invalid')));
      setCode('');
    }
  }

  // App relancée pendant la vérification : rien à vérifier, on repart de la connexion.
  if (!pending || pending.kind === 'reset') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>{t('auth.otpTitle')}</Text>
        <Banner kind="info" message={t('apiErrors.reasons.challenge_invalid')} />
        <Button label={t('auth.login')} onPress={() => router.replace('/(auth)/login')} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  const minutes = expiresAt ? Math.max(1, Math.round((expiresAt - Date.now()) / 60000)) : null;

  function onChangeCode(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void handleVerify(digits);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={12} accessibilityRole="button">
        <ArrowLeft size={18} color={colors.accent} />
        <Text style={styles.backText}>{t('common.back')}</Text>
      </Pressable>

      <Text style={styles.title} accessibilityRole="header">
        {t(pending.kind === 'login' ? 'auth.twofaTitle' : 'auth.otpTitle')}
      </Text>
      <Text style={styles.subtitle}>
        {t(pending.kind === 'login' ? 'auth.twofaSubtitle' : 'auth.otpSubtitle', { destination: destination || '—' })}
        {minutes ? ` ${t('auth.codeValidity', { count: minutes })}` : ''}
      </Text>

      {error && (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner kind="error" message={error} />
        </View>
      )}

      <Pressable
        style={styles.boxesRow}
        onPress={() => inputRef.current?.focus()}
        accessibilityRole="button"
        accessibilityLabel={t('auth.codeFieldA11y', { count: code.length, total: CODE_LENGTH })}
      >
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.box, i === code.length && styles.boxActive]}>
            <Text style={styles.boxText}>{code[i] ?? ''}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={onChangeCode}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        style={styles.hiddenInput}
        autoFocus
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        accessibilityLabel={t('auth.codeFieldA11y', { count: code.length, total: CODE_LENGTH })}
      />

      <View style={styles.resendRow}>
        {secondsLeft > 0 ? (
          <Text style={styles.resendText}>
            {t('auth.resendIn')} <Text style={styles.resendTime}>0:{secondsLeft.toString().padStart(2, '0')}</Text>
          </Text>
        ) : (
          <Text style={[styles.resendText, styles.resendLink]} accessibilityRole="button" onPress={() => {
            setError(null);
            resendOtp.mutate(undefined, {
              onSuccess: () => {
                setSecondsLeft(RESEND_SECONDS);
                setCode('');
              },
              onError: (e) => setError(toUserMessage(e)),
            });
          }}>
            {t('auth.resendCode')}
          </Text>
        )}
      </View>

      <Button
        label={t('auth.verify')}
        onPress={() => handleVerify(code)}
        loading={verifyOtp.isPending}
        disabled={code.length !== CODE_LENGTH}
      />

      {devHint && (
        <View style={styles.devHintBox}>
          <Text style={styles.devHintText}>{t('auth.devHint', { code: devHint })}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.xxl, paddingTop: spacing.xxxl },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xxl },
  backText: { ...typography.body, fontFamily: fontFamily.medium, color: colors.accent },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.muted, lineHeight: 22, marginBottom: spacing.xxxl },
  boxesRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.xl },
  box: {
    width: 46,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary },
  boxText: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resendRow: { alignItems: 'center', marginBottom: spacing.xxl },
  resendText: { ...typography.body, color: colors.muted },
  resendTime: { fontFamily: fontFamily.semiBold, color: colors.accent },
  resendLink: { color: colors.accent, fontFamily: fontFamily.semiBold },
  devHintBox: {
    marginTop: spacing.xl,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  devHintText: { ...typography.caption, color: colors.ink, textAlign: 'center' },
}));
