import { FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, FileClock, Plus, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Card, SkeletonCard } from '@/components';
import { fontFamily, makeStyles, radii, shadow, spacing, touchTarget, typography, useTheme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { useShares } from '@/api/hooks/useSharing';
import { toUserMessage } from '@/api/errors';
import { ChildSelector } from '@/features/children/ChildSelector';
import { useSelectedChild } from '@/features/children/useSelectedChild';
import { permissionLabel } from '@/features/sharing/permissions';
import { activeShareCount } from '@/features/sharing/inviteRules';
import { SHARING_RULES } from '@/config/business';

export default function SharingScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isPrincipal = user?.role === 'principal';
  const { children, activeChild, isLoading: childrenLoading, select } = useSelectedChild();
  const shares = useShares(isPrincipal ? activeChild?.id : undefined);

  if (!isPrincipal) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.restricted}>
          <Users size={32} color={colors.muted} />
          <Text style={styles.restrictedText}>{t('sharing.primaryOnly')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const limitReached = activeShareCount(shares.data) >= SHARING_RULES.maxSecondariesPerChild;

  function openInvite() {
    if (!activeChild) return;
    router.push({ pathname: '/(main)/sharing/invite', params: { childId: activeChild.id } });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">{t('sharing.title')}</Text>
        {activeChild && (
          <Pressable
            onPress={() => router.push({ pathname: '/(main)/sharing/audit', params: { childId: activeChild.id } })}
            hitSlop={12}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel={t('sharing.auditTitle')}
          >
            <FileClock size={22} color={colors.accent} />
          </Pressable>
        )}
      </View>

      <ChildSelector
        childrenList={children ?? []}
        activeId={activeChild?.id}
        onSelect={select}
        contextLabel={t('tabs.sharing')}
      />

      {childrenLoading ? (
        <View style={styles.list}>
          <SkeletonCard />
        </View>
      ) : !activeChild ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('sharing.noChild')}</Text>
        </View>
      ) : (
        <FlatList
          data={shares.data ?? []}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshing={shares.isRefetching}
          onRefresh={() => void shares.refetch()}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.context}>{t('sharing.forChild', { name: activeChild.prenom })}</Text>
              <Text style={styles.slots}>
                {t('sharing.slotsUsed', { count: activeShareCount(shares.data), max: SHARING_RULES.maxSecondariesPerChild })}
              </Text>
              {shares.isError && (
                <View style={styles.errorBox}>
                  <Banner kind="error" message={toUserMessage(shares.error)} />
                  <Button label={t('common.retry')} variant="ghost" onPress={() => void shares.refetch()} />
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            shares.isLoading ? (
              <SkeletonCard />
            ) : shares.isError ? null : (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyText}>{t('sharing.empty')}</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(main)/sharing/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={t('sharing.shareA11y', { name: item.nom, status: t(`sharing.status.${item.status}`) })}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.name} numberOfLines={1}>{item.nom}</Text>
                  <Text style={[styles.status, item.status === 'actif' && styles.statusActive]}>
                    {t(`sharing.status.${item.status}`)}
                  </Text>
                  <ChevronRight size={18} color={colors.muted} />
                </View>
                <Text style={styles.rightsSummary} numberOfLines={2}>
                  {item.permissions.length === 0
                    ? t('sharing.noRights')
                    : item.permissions.map((p) => permissionLabel(t, p).label).join(', ')}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}

      {activeChild && (
        <Pressable
          style={({ pressed }) => [styles.fab, limitReached && styles.fabDisabled, pressed && !limitReached && styles.pressed]}
          onPress={limitReached ? undefined : openInvite}
          disabled={limitReached}
          accessibilityRole="button"
          accessibilityState={{ disabled: limitReached }}
          accessibilityLabel={t('sharing.inviteFor', { name: activeChild.prenom })}
          accessibilityHint={limitReached ? t('apiErrors.reasons.secondary_limit', { max: SHARING_RULES.maxSecondariesPerChild }) : undefined}
        >
          <Plus size={26} color={colors.onPrimary} />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  headerAction: { minWidth: touchTarget.min, minHeight: touchTarget.min, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  listHeader: { gap: spacing.xs, marginBottom: spacing.md },
  context: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  slots: { ...typography.caption, color: colors.muted },
  errorBox: { marginTop: spacing.sm, gap: spacing.xs },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyInline: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center' },
  list: { padding: spacing.xl, paddingTop: spacing.sm, paddingBottom: 112 },
  card: { marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  name: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, flex: 1 },
  status: { ...typography.caption, color: colors.muted },
  statusActive: { color: colors.veille, fontFamily: fontFamily.semiBold },
  rightsSummary: { ...typography.caption, color: colors.muted },
  pressed: { opacity: 0.75 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  fabDisabled: { backgroundColor: colors.muted },
  restricted: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  restrictedText: { ...typography.body, color: colors.muted, textAlign: 'center' },
}));
