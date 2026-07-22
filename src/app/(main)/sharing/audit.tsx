import { useEffect } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useChildren } from '@/api/hooks/useChildren';
import { useAccessAudit } from '@/api/hooks/useSharing';
import { useUiStore } from '@/stores/uiStore';
import { formatClock, formatRelativeTime } from '@/utils/format';

export default function AccessAuditScreen() {
  const { data: children } = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);

  useEffect(() => {
    if (!selectedChildId && children && children.length > 0) setSelectedChildId(children[0].id);
  }, [children, selectedChildId, setSelectedChildId]);

  const activeChild = children?.find((c) => c.id === selectedChildId) ?? children?.[0];
  const { data: audit } = useAccessAudit(activeChild?.id);

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title}>Journal des accès</Text>

      {children && children.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherRow}>
          {children.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setSelectedChildId(c.id)}
              style={[styles.chip, c.id === activeChild?.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, c.id === activeChild?.id && styles.chipTextActive]}>{c.prenom}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {!audit || audit.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucune consultation enregistrée.</Text>
        </View>
      ) : (
        <FlatList
          data={audit}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View>
                <Text style={styles.rowName}>{item.secondaryNom}</Text>
                <Text style={styles.rowInfo}>{item.infoType}</Text>
              </View>
              <Text style={styles.rowTime}>{formatClock(item.timestamp)} · {formatRelativeTime(item.timestamp)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, paddingTop: spacing.xxxl },
  backButton: { marginLeft: spacing.xl, marginBottom: spacing.md },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  switcherRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: '#F0EDE8' },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  chipTextActive: { color: colors.white },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { ...typography.body, color: colors.muted },
  list: { padding: spacing.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowName: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  rowInfo: { ...typography.caption, color: colors.muted },
  rowTime: { ...typography.caption, color: colors.muted },
});
