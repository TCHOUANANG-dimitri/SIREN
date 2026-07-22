import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle } from 'lucide-react-native';
import { Card, StateBadge } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useAllAlerts } from '@/api/hooks/useAlerts';
import { useChildren } from '@/api/hooks/useChildren';
import { formatRelativeTime } from '@/utils/format';
import type { Alert } from '@/models/entities';

export default function AlertsScreen() {
  const { data: alerts, isLoading } = useAllAlerts();
  const { data: children } = useChildren();
  const [childFilter, setChildFilter] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<Alert['level'] | null>(null);

  const filtered = useMemo(() => {
    if (!alerts) return [];
    return alerts
      .filter((a) => !childFilter || a.childId === childFilter)
      .filter((a) => !levelFilter || a.level === levelFilter)
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
  }, [alerts, childFilter, levelFilter]);

  function childName(childId: string) {
    return children?.find((c) => c.id === childId)?.prenom ?? '—';
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Alertes</Text>

      <View style={styles.filterRow}>
        <Pressable onPress={() => setChildFilter(null)} style={[styles.chip, !childFilter && styles.chipActive]}>
          <Text style={[styles.chipText, !childFilter && styles.chipTextActive]}>Tous</Text>
        </Pressable>
        {children?.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setChildFilter(c.id)}
            style={[styles.chip, childFilter === c.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, childFilter === c.id && styles.chipTextActive]}>{c.prenom}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.filterRow}>
        {(['prealerte', 'urgence'] as const).map((level) => (
          <Pressable
            key={level}
            onPress={() => setLevelFilter(levelFilter === level ? null : level)}
            style={[styles.chip, levelFilter === level && styles.chipActive]}
          >
            <Text style={[styles.chipText, levelFilter === level && styles.chipTextActive]}>
              {level === 'prealerte' ? 'Pré-alerte' : 'Urgence'}
            </Text>
          </Pressable>
        ))}
      </View>

      {!isLoading && filtered.length === 0 ? (
        <View style={styles.empty}>
          <AlertTriangle size={32} color={colors.muted} />
          <Text style={styles.emptyText}>Aucune alerte — tout va bien.</Text>
        </View>
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(a) => a.id}
          estimatedItemSize={92}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/(main)/alerts/${item.id}`)}>
              <Card style={[styles.card, item.status === 'active' && styles.cardActive]}>
                <View style={styles.cardHeader}>
                  <StateBadge state={item.level} compact />
                  <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
                </View>
                <Text style={styles.childName}>{childName(item.childId)}</Text>
                <Text style={styles.reason} numberOfLines={1}>
                  {item.reasons.join(', ')}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  filterRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.md, flexWrap: 'wrap' },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: '#F0EDE8' },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  chipTextActive: { color: colors.white },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { ...typography.body, color: colors.muted },
  list: { padding: spacing.xl, gap: spacing.sm },
  card: { marginBottom: spacing.sm },
  cardActive: { borderWidth: 1.5, borderColor: colors.primary },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  time: { ...typography.caption, color: colors.muted },
  childName: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: 2 },
  reason: { ...typography.caption, color: colors.muted },
});
