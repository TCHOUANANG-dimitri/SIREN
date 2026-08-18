import { useEffect } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileClock, Plus, Users } from 'lucide-react-native';
import { Card } from '@/components';
import { colors, fontFamily, radii, shadow, spacing, typography } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { useChildren } from '@/api/hooks/useChildren';
import { useShares } from '@/api/hooks/useSharing';
import { useUiStore } from '@/stores/uiStore';
import { permissionLabels } from '@/features/sharing/permissions';
import type { SecondaryAccess } from '@/models/entities';

const statusLabel: Record<SecondaryAccess['status'], string> = {
  invite: 'Invité',
  actif: 'Actif',
  revoque: 'Révoqué',
};

export default function SharingScreen() {
  const user = useAuthStore((s) => s.user);
  const { data: children } = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);

  useEffect(() => {
    if (!selectedChildId && children && children.length > 0) setSelectedChildId(children[0].id);
  }, [children, selectedChildId, setSelectedChildId]);

  const activeChild = children?.find((c) => c.id === selectedChildId) ?? children?.[0];
  const { data: shares } = useShares(user?.role === 'principal' ? activeChild?.id : undefined);

  if (user?.role !== 'principal') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.restricted}>
          <Users size={32} color={colors.muted} />
          <Text style={styles.restrictedText}>
            La gestion des accès partagés est réservée au parent principal.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Partage</Text>
        <Pressable onPress={() => router.push('/(main)/sharing/audit')} hitSlop={8}>
          <FileClock size={22} color={colors.primary} />
        </Pressable>
      </View>

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

      {!shares || shares.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Ajoutez un proche de confiance pour partager la surveillance.</Text>
        </View>
      ) : (
        <FlatList
          data={shares}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/(main)/sharing/${item.id}`)}>
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.name}>{item.nom}</Text>
                  <Text style={[styles.status, item.status === 'actif' && styles.statusActive]}>
                    {statusLabel[item.status]}
                  </Text>
                </View>
                <Text style={styles.rightsSummary} numberOfLines={1}>
                  {item.permissions.length === 0
                    ? 'Aucun droit accordé'
                    : item.permissions.map((p) => permissionLabels[p].label).join(', ')}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={() => router.push({ pathname: '/(main)/sharing/invite', params: { childId: activeChild?.id ?? '' } })}
        accessibilityLabel="Inviter une personne"
      >
        <Plus size={26} color={colors.white} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  switcherRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceChip },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  chipTextActive: { color: colors.white },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center' },
  list: { padding: spacing.xl, paddingBottom: 96 },
  card: { marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  name: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  status: { ...typography.caption, color: colors.muted },
  statusActive: { color: colors.veille, fontFamily: fontFamily.semiBold },
  rightsSummary: { ...typography.caption, color: colors.muted },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  restricted: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  restrictedText: { ...typography.body, color: colors.muted, textAlign: 'center' },
});
