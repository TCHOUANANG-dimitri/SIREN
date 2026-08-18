import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Ear, ShieldAlert } from 'lucide-react-native';
import { Banner, Button, Card, TextField } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useAudioLogs, useRequestAudioActivation } from '@/api/hooks/useAudio';
import { ApiError } from '@/api/network';
import { formatClock } from '@/utils/format';

const SESSION_SECONDS = 30;

export default function AudioListeningScreen() {
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
      await requestActivation.mutateAsync({ reason: reason || 'Demande explicite du parent', explicitRequest: true });
      setSecondsLeft(SESSION_SECONDS);
    } catch (error) {
      setRefusedMessage(error instanceof ApiError ? error.message : 'Écoute non disponible.');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton} accessibilityLabel="Retour">
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>

      <Text style={styles.title}>Écoute audio encadrée</Text>

      <View style={styles.warningBox}>
        <ShieldAlert size={18} color={colors.primaryDark} />
        <Text style={styles.warningText}>
          Le son ambiant n&apos;est jamais transmis brut. Seules des étiquettes classées sur l&apos;appareil sont
          affichées (cri, voix, véhicule…), et toute activation est journalisée.
        </Text>
      </View>

      {refusedMessage && <Banner kind="error" message={refusedMessage} />}

      {secondsLeft > 0 && activeLog ? (
        <Card style={styles.activeCard}>
          <View style={styles.activeHeader}>
            <Ear size={18} color={colors.primary} />
            <Text style={styles.activeTitle}>Session active — {secondsLeft}s</Text>
          </View>
          {activeLog.labels.map((label) => (
            <View key={label} style={styles.labelPill}>
              <Text style={styles.labelPillText}>{label}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <View style={styles.requestBlock}>
          <TextField label="Motif de la demande" value={reason} onChangeText={setReason} placeholder="Confirmer l'urgence en cours" />
          <Button label="Demander l'écoute" icon={<Ear size={16} color={colors.white} />} onPress={activate} loading={requestActivation.isPending} />
        </View>
      )}

      <Text style={styles.journalTitle}>Journal d&apos;activation</Text>
      {!logs || logs.length === 0 ? (
        <Text style={styles.emptyText}>Aucune activation enregistrée.</Text>
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
