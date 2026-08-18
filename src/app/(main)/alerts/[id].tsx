import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { ArrowLeft } from 'lucide-react-native';
import { Banner, Button, Card, Skeleton, StateBadge } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useAllAlerts, usePatchAlert } from '@/api/hooks/useAlerts';
import { useChildren } from '@/api/hooks/useChildren';
import { useCurrentAccess } from '@/features/sharing/useCurrentAccess';
import { formatClock } from '@/utils/format';

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: alerts } = useAllAlerts();
  const { data: children } = useChildren();
  const alert = alerts?.find((a) => a.id === id);
  const { can } = useCurrentAccess(alert?.childId);
  const patchAlert = usePatchAlert();
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!alert) return <SafeAreaView style={styles.container} edges={['top']}><View style={styles.padded}><Skeleton height={300} radius={16} /></View></SafeAreaView>;
  const child = children?.find((c) => c.id === alert.childId);
  const isUrgence = alert.level === 'urgence';
  const canManage = can('close_or_mark_false_alert');

  async function acknowledge() {
    if (!alert) return;
    await patchAlert.mutateAsync({ alertId: alert.id, status: 'acquittee' });
    setFeedback('Alerte acquittée.');
  }

  async function markFalse() {
    if (!alert) return;
    await patchAlert.mutateAsync({ alertId: alert.id, status: 'fausse' });
    setFeedback('Merci — cette information affine la précision du modèle.');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={[styles.headerBanner, { backgroundColor: isUrgence ? colors.urgence : colors.prealerte }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton} accessibilityLabel="Retour">
          <ArrowLeft size={20} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>{isUrgence ? 'Urgence' : 'Pré-alerte'}</Text>
        <Text style={styles.headerSubtitle}>
          {child?.prenom} · {formatClock(alert.createdAt)}
        </Text>
      </View>

      {feedback && (
        <View style={styles.padded}>
          <Banner kind="success" message={feedback} />
        </View>
      )}

      {alert.lat && alert.lon && (
        <MapView
          style={styles.map}
          initialRegion={{ latitude: alert.lat, longitude: alert.lon, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        >
          <Marker coordinate={{ latitude: alert.lat, longitude: alert.lon }} pinColor={isUrgence ? colors.urgence : colors.prealerte} />
        </MapView>
      )}

      <View style={styles.padded}>
        <Card style={styles.card}>
          <View style={styles.scoreRow}>
            <Text style={styles.cardTitle}>Score au moment de l&apos;alerte</Text>
            <StateBadge state={alert.level} compact />
          </View>
          <Text style={styles.scoreValue}>{alert.score}</Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Raisons détaillées</Text>
          {alert.reasons.map((reason) => (
            <Text key={reason} style={styles.reasonItem}>
              • {reason}
            </Text>
          ))}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Statut</Text>
          <Text style={styles.statusValue}>{statusLabel(alert.status)}</Text>
        </Card>

        {canManage && alert.status === 'active' && (
          <View style={styles.actions}>
            <Button label="Acquitter (j'ai vu)" onPress={acknowledge} loading={patchAlert.isPending} />
            {isUrgence && (
              <Button
                label="Voir l'écran d'urgence"
                variant="emergency"
                onPress={() => router.push({ pathname: '/(emergency)/urgence', params: { childId: alert.childId } })}
              />
            )}
            <Button label="Marquer comme fausse alerte" variant="secondary" onPress={markFalse} loading={patchAlert.isPending} />
          </View>
        )}
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

function statusLabel(status: string) {
  return { active: 'Active', acquittee: 'Acquittée', fausse: 'Fausse alerte', resolue: 'Résolue' }[status] ?? status;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xxxl },
  headerBanner: { padding: spacing.xl, paddingTop: spacing.xxxl },
  backButton: { marginBottom: spacing.lg },
  headerTitle: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.white },
  headerSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  map: { height: 200 },
  padded: { padding: spacing.lg },
  card: { marginBottom: spacing.md },
  cardTitle: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.sm },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreValue: { ...typography.display, fontFamily: fontFamily.bold, color: colors.ink, marginTop: spacing.sm },
  reasonItem: { ...typography.body, color: colors.slate, marginBottom: spacing.xs },
  statusValue: { ...typography.body, fontFamily: fontFamily.medium, color: colors.slate },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
