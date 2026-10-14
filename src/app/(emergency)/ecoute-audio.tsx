import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Ear, ShieldAlert } from 'lucide-react-native';
import { Banner, Button, Card, TextField } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useAudioLogs, useRequestAudioActivation } from '@/api/hooks/useAudio';
import { toUserMessage } from '@/api/errors';
import { formatClock } from '@/utils/format';
import { useTranslation } from 'react-i18next';
import { featureFlags } from '@/config/env';

/** Motif obligatoire : le journal doit dire pourquoi l'écoute a été demandée (CDC App §4.4). */
const MIN_REASON_LENGTH = 10;

const SESSION_SECONDS = 30;

export default function AudioListeningScreen() {
  const { t } = useTranslation();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { data: logs } = useAudioLogs(childId);
  const requestActivation = useRequestAudioActivation(childId);
  const [reason, setReason] = useState('');
  const [refusedMessage, setRefusedMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const activeLog = requestActivation.data;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function activate() {
    setRefusedMessage(null);
    try {
      await requestActivation.mutateAsync({ reason: reason.trim(), explicitRequest: true });
      setSecondsLeft(SESSION_SECONDS);
    } catch (error) {
      setRefusedMessage(toUserMessage(error, t('errors.audioConditions')));
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton} accessibilityLabel={t('common.back')}>
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>

      <Text style={styles.title}>{t('emergency.audioListening')}</Text>

      <View style={styles.warningBox}>
        <ShieldAlert size={18} color={colors.primaryDark} />
        <Text style={styles.warningText}>{t('emergency.audioPrivacyNotice')}</Text>
      </View>

      {!featureFlags.audio && <Banner kind="warning" message={t('emergency.audioLegalPending')} />}

      {refusedMessage && <Banner kind="error" message={refusedMessage} />}

      {secondsLeft > 0 && activeLog ? (
        <Card style={styles.activeCard}>
          <View style={styles.activeHeader}>
            <Ear size={18} color={colors.primary} />
            <Text style={styles.activeTitle}>{t('emergency.audioSessionActive', { seconds: secondsLeft })}</Text>
          </View>
          {activeLog.labels.map((label) => (
            <View key={label} style={styles.labelPill}>
              <Text style={styles.labelPillText}>{label}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <View style={styles.requestBlock}>
          <TextField label={t('emergency.requestReason')} value={reason} onChangeText={setReason} placeholder={t('emergency.requestReasonPlaceholder')} />
          <Button label={t('emergency.requestListening')} icon={<Ear size={16} color={colors.white} />} onPress={activate} loading={requestActivation.isPending} disabled={!featureFlags.audio || reason.trim().length < MIN_REASON_LENGTH} />
        </View>
      )}

      <Text style={styles.journalTitle}>{t('emergency.activationLog')}</Text>
      {!logs || logs.length === 0 ? (
        <Text style={styles.emptyText}>{t('emergency.noActivation')}</Text>
      ) : (
        logs.map((log) => (
          <Card key={log.id} style={styles.journalCard}>
            <Text style={styles.journalLine}>
              {log.requestedBy} · {formatClock(log.startedAt)}
            </Text>
            <Text style={styles.journalReason}>{log.reason}</Text>
          </Card>
        ))
      )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  backButton: { marginBottom: spacing.md },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.lg },
  warningBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  warningText: { ...typography.caption, color: colors.primaryDark, flex: 1, lineHeight: 18 },
  requestBlock: { marginBottom: spacing.xl },
  activeCard: { marginBottom: spacing.xl, gap: spacing.sm },
  activeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  activeTitle: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  labelPill: { backgroundColor: colors.surfaceAlt, borderRadius: radii.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, alignSelf: 'flex-start', marginBottom: spacing.xs },
  labelPillText: { ...typography.caption, fontFamily: fontFamily.medium, color: colors.primaryDark },
  journalTitle: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.sm },
  emptyText: { ...typography.body, color: colors.muted },
  journalCard: { marginBottom: spacing.sm },
  journalLine: { ...typography.body, fontFamily: fontFamily.medium, color: colors.ink },
  journalReason: { ...typography.caption, color: colors.muted, marginTop: 2 },
});
