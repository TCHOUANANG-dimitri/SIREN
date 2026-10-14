import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, MessageSquareWarning } from 'lucide-react-native';
import { Banner, Button, Card, PermissionToggle, TextField } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useCommunityReports, useCreateCommunityReport } from '@/api/hooks/useCommunity';
import { useLocationStore } from '@/stores/locationStore';
import { storage } from '@/utils/storage';
import { toUserMessage } from '@/api/errors';
import { isMockMode } from '@/api/network';
import { formatRelativeTime } from '@/utils/format';
import { useTranslation } from 'react-i18next';

const PROXIMITY_KEY = 'siren.prefs.communityProximity';
const MIN_REPORT_LENGTH = 10;

/**
 * Volet communautaire — CDC App §4.6. Un signalement est modéré avant d'être
 * visible (serveur) ; l'auteur n'est pas exposé aux autres utilisateurs.
 */
export default function CommunityScreen() {
  const { t } = useTranslation();
  const { data: reports } = useCommunityReports();
  const createReport = useCreateCommunityReport();
  // Le lieu d'un signalement est celui du TÉLÉPHONE du parent, jamais la position de l'enfant.
  const phone = useLocationStore();
  const [description, setDescription] = useState('');
  const [proximityAlerts, setProximityAlerts] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    storage.getItem<boolean>(PROXIMITY_KEY).then((v) => setProximityAlerts(!!v)).catch(() => {});
  }, []);

  function toggleProximity(value: boolean) {
    setProximityAlerts(value);
    void storage.setItem(PROXIMITY_KEY, value);
  }

  async function submit() {
    setFeedback(null);
    if (description.trim().length < MIN_REPORT_LENGTH) {
      setFeedback({ kind: 'error', text: t('community.tooShort', { min: MIN_REPORT_LENGTH }) });
      return;
    }
    if (!phone.permissionGranted || !phone.hasFix) {
      setFeedback({ kind: 'error', text: t('community.locationRequired') });
      return;
    }
    try {
      await createReport.mutateAsync({ description: description.trim(), lat: phone.latitude, lon: phone.longitude });
      setDescription('');
      setFormOpen(false);
      setFeedback({ kind: 'success', text: isMockMode() ? t('community.published') : t('community.pendingModeration') });
    } catch (error) {
      setFeedback({ kind: 'error', text: toUserMessage(error, t('community.reportFailed')) });
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton} accessibilityLabel={t('common.back')}>
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title}>{t('community.title')}</Text>

      <View style={styles.padded}>
        <Card style={styles.toggleCard}>
          <PermissionToggle
            label={t('community.nearbyAlerts')}
            description={t('community.nearbyAlertsDescription')}
            value={proximityAlerts}
            onValueChange={toggleProximity}
          />
          <Text style={styles.reportMeta}>{t('community.proximityLocalOnly')}</Text>
        </Card>
        {feedback && <Banner kind={feedback.kind} message={feedback.text} />}
      </View>

      {!reports || reports.length === 0 ? (
        <View style={styles.empty}>
          <MessageSquareWarning size={28} color={colors.muted} />
          <Text style={styles.emptyText}>{t('community.noReports')}</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Card style={styles.reportCard}>
              <Text style={styles.reportDescription}>{item.description}</Text>
              <Text style={styles.reportMeta}>
                {item.authorNom ? `${item.authorNom} · ` : ''}{formatRelativeTime(item.createdAt)}
              </Text>
            </Card>
          )}
        />
      )}

      {formOpen ? (
        <View style={styles.formPanel}>
          <TextField
            label={t('community.reportLabel')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('community.reportPlaceholder')}
            multiline
          />
          <View style={styles.formActions}>
            <Button label={t('common.cancel')} variant="ghost" onPress={() => setFormOpen(false)} />
            <Button label={t('common.send')} onPress={submit} loading={createReport.isPending} disabled={!description.trim()} />
          </View>
        </View>
      ) : (
        <View style={styles.footer}>
          <Button label={t('community.reportButton')} onPress={() => setFormOpen(true)} />
        </View>
      )}
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingTop: spacing.xxxl },
  backButton: { marginLeft: spacing.xl, marginBottom: spacing.md },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  padded: { paddingHorizontal: spacing.xl },
  toggleCard: { marginBottom: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center' },
  list: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  reportCard: { marginBottom: spacing.sm },
  reportDescription: { ...typography.body, color: colors.ink, marginBottom: spacing.xs },
  reportMeta: { ...typography.caption, color: colors.muted },
  formPanel: { padding: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border },
  formActions: { flexDirection: 'row', gap: spacing.sm },
  footer: { padding: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border },
});
