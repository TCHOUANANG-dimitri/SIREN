import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, ShieldCheck } from 'lucide-react-native';
import { Banner, SkeletonCard } from '@/components';
import { colors, fontFamily, shadow, spacing, typography } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { useChildren } from '@/api/hooks/useChildren';
import { useAllAlerts } from '@/api/hooks/useAlerts';
import { ChildCard } from '@/features/children/ChildCard';
import type { Child } from '@/models/entities';

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const { data: children, isLoading, isError, refetch, isRefetching } = useChildren();
  const { data: allAlerts } = useAllAlerts();

  const sortedChildren = useMemo(() => {
    if (!children) return [];
    const activeChildIds = new Set(
      (allAlerts ?? []).filter((a) => a.status === 'active').map((a) => a.childId)
    );
    return [...children].sort((a, b) => Number(activeChildIds.has(b.id)) - Number(activeChildIds.has(a.id)));
  }, [children, allAlerts]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour {user?.nom?.split(' ')[0] ?? ''}</Text>
          <Text style={styles.subGreeting}>Voici l&apos;état de vos enfants</Text>
        </View>
        <Pressable onPress={() => router.push('/(main)/(tabs)/settings')} hitSlop={8} style={styles.settingsIcon}>
          <ShieldCheck size={22} color={colors.primary} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.list}>
          <SkeletonCard />
          <View style={{ height: spacing.md }} />
          <SkeletonCard />
        </View>
      ) : isError ? (
        <View style={styles.list}>
          <Banner kind="error" message="Impossible de charger vos enfants. Vérifiez votre connexion." />
        </View>
      ) : sortedChildren.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Ajoutez votre premier enfant</Text>
          <Text style={styles.emptyBody}>Appairez un dispositif SIREN pour commencer la protection.</Text>
        </View>
      ) : (
        <FlatList
          data={sortedChildren}
          keyExtractor={(item: Child) => item.id}
          renderItem={({ item }) => <ChildCard child={item} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        />
      )}

      <Pressable style={styles.fab} onPress={() => router.push('/(main)/add-child')} accessibilityLabel="Ajouter un enfant">
        <Plus size={26} color={colors.white} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  greeting: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  subGreeting: { ...typography.caption, color: colors.muted, marginTop: 2 },
  settingsIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.xl, paddingTop: 0 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...typography.title2, fontFamily: fontFamily.semiBold, color: colors.ink, textAlign: 'center' },
  emptyBody: { ...typography.body, color: colors.muted, textAlign: 'center' },
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
});
