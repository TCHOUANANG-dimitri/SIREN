import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useVerifyOtp } from '@/api/hooks/useAuth';
import { usePendingAuthStore } from '@/stores/pendingAuthStore';
import { ApiError } from '@/api/network';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function OtpScreen() {
  const { t } = useTranslation();
  const { destination, devHint } = usePendingAuthStore();
  const verifyOtp = useVerifyOtp();
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
    setError(null);
    try {
      await verifyOtp.mutateAsync(value);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('auth.otpInvalid'));
      setCode('');
    }
  }

  function onChangeCode(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void handleVerify(digits);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable onPress={() => router.back()} style={styles.backRow} hitSlop={8}>
        <ArrowLeft size={18} color={colors.primary} />
        <Text style={styles.backText}>{t('common.back')}</Text>
      </Pressable>

      <Text style={styles.title}>{t('auth.otpTitle')}</Text>
      <Text style={styles.subtitle}>
        {t('auth.otpSubtitle', { destination: destination || '—' })}
      </Text>

      {error && (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner kind="error" message={error} />
        </View>
      )}

      <Pressable style={styles.boxesRow} onPress={() => inputRef.current?.focus()}>
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
      />

      <View style={styles.resendRow}>
        {secondsLeft > 0 ? (
          <Text style={styles.resendText}>
            {t('auth.resendIn')} <Text style={styles.resendTime}>0:{secondsLeft.toString().padStart(2, '0')}</Text>
          </Text>
        ) : (
          <Text style={[styles.resendText, styles.resendLink]} onPress={() => setSecondsLeft(RESEND_SECONDS)}>
            Renvoyer le code
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
          <Text style={styles.devHintText}>Démo : code de vérification = {devHint}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.xxl, paddingTop: spacing.xxxl },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xxl },
  backText: { ...typography.body, fontFamily: fontFamily.medium, color: colors.primary },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.muted, lineHeight: 22, marginBottom: spacing.xxxl },
  boxesRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.xl },
  box: {
    width: 46,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.white,
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
  resendTime: { fontFamily: fontFamily.semiBold, color: colors.primary },
  resendLink: { color: colors.primary, fontFamily: fontFamily.semiBold },
  devHintBox: {
    marginTop: spacing.xl,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  devHintText: { ...typography.caption, color: colors.primaryDark, textAlign: 'center' },
});
