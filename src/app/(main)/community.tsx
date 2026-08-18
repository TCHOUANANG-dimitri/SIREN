import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, MessageSquareWarning } from 'lucide-react-native';
import { Banner, Button, Card, PermissionToggle, TextField } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useCommunityReports, useCreateCommunityReport } from '@/api/hooks/useCommunity';
import { usePosition } from '@/api/hooks/useTracking';
import { useChildren } from '@/api/hooks/useChildren';
import { formatRelativeTime } from '@/utils/format';

export default function CommunityScreen() {
  const { data: reports } = useCommunityReports();
  const createReport = useCreateCommunityReport();
  const { data: children } = useChildren();
  const { data: position } = usePosition(children?.[0]?.id);
  const [description, setDescription] = useState('');
  const [proximityAlerts, setProximityAlerts] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  async function submit() {
    if (!description.trim()) return;
    await createReport.mutateAsync({
      description: description.trim(),
      lat: position?.lat ?? 0,
      lon: position?.lon ?? 0,
    });
    setDescription('');
    setFormOpen(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton} accessibilityLabel="Retour">
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title}>Volet communautaire</Text>

      <View style={styles.padded}>
        <Card style={styles.toggleCard}>
          <PermissionToggle
            label="Alertes de disparition à proximité"
            description="Recevoir une notification si une disparition est signalée dans votre secteur."
            value={proximityAlerts}
            onValueChange={setProximityAlerts}
          />
        </Card>
      </View>

      {!reports || reports.length === 0 ? (
        <View style={styles.empty}>
          <MessageSquareWarning size={28} color={colors.muted} />
          <Text style={styles.emptyText}>Aucun signalement récent dans votre secteur.</Text>
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
                {item.authorNom} · {formatRelativeTime(item.createdAt)}
              </Text>
            </Card>
          )}
        />
      )}

      {formOpen ? (
        <View style={styles.formPanel}>
          {createReport.isError && <Banner kind="error" message="Impossible d'envoyer le signalement." />}
          <TextField
            label="Description du signalement"
            value={description}
            onChangeText={setDescription}
            placeholder="Comportement suspect observé…"
            multiline
          />
          <View style={styles.formActions}>
            <Button label="Annuler" variant="ghost" onPress={() => setFormOpen(false)} />
            <Button label="Envoyer" onPress={submit} loading={createReport.isPending} disabled={!description.trim()} />
          </View>
        </View>
      ) : (
        <View style={styles.footer}>
          <Button label="Signaler un comportement suspect" onPress={() => setFormOpen(true)} />
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
