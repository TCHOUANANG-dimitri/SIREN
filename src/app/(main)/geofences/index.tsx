import { formatDistanceM } from '@/utils/format';
import { useState } from 'react';
import { Alert as RNAlert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Plus, ShieldBan, ShieldCheck } from 'lucide-react-native';
import { Banner, Card } from '@/components';
import { toUserMessage } from '@/api/errors';
import { CONFIG_LIMITS } from '@/config/business';
import { ChildSelector } from '@/features/children/ChildSelector';
import { useSelectedChild } from '@/features/children/useSelectedChild';
import { fontFamily, radii, shadow, spacing, typography, makeStyles, useTheme } from '@/theme';
import { useDeleteGeofence, useGeofences } from '@/api/hooks/useGeofences';
import { useTranslation } from 'react-i18next';

export default function GeofencesListScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { children, activeChild, select } = useSelectedChild();
  const { data: geofences } = useGeofences(activeChild?.id);
  const deleteGeofence = useDeleteGeofence(activeChild?.id);
  const [error, setError] = useState<string | null>(null);
  const limitReached = (geofences?.length ?? 0) >= CONFIG_LIMITS.geofencesPerChild;

  function confirmDelete(id: string, nom: string) {
    RNAlert.alert(t('geofences.deleteTitle'), t('geofences.deleteConfirm', { name: nom }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          setError(null);
          deleteGeofence.mutate(id, { onError: (e) => setError(toUserMessage(e)) });
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton} accessibilityLabel={t('common.back')}>
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title}>{t('geofences.title')}</Text>

      <Text style={styles.subtitle}>{t('geofences.subtitle')}</Text>
      <ChildSelector childrenList={children ?? []} activeId={activeChild?.id} onSelect={select} contextLabel={t('geofences.title')} />
      {error && (
        <View style={styles.banner}>
          <Banner kind="error" message={error} />
        </View>
      )}
      {limitReached && (
        <View style={styles.banner}>
          <Banner kind="warning" message={t('apiErrors.reasons.geofence_limit', { max: CONFIG_LIMITS.geofencesPerChild })} />
        </View>
      )}

      {!geofences || geofences.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('geofences.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={geofences}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(main)/geofences/[id]', params: { id: item.id, childId: activeChild?.id ?? '' } })}
              onLongPress={() => confirmDelete(item.id, item.nom)}
            >
              <Card style={styles.card}>
                {item.type === 'autorise' ? (
                  <ShieldCheck size={20} color={colors.veille} />
                ) : (
                  <ShieldBan size={20} color={colors.urgence} />
                )}
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{item.nom}</Text>
                  <Text style={styles.cardMeta}>
                    {item.type === 'autorise' ? t('geofences.allowed') : t('geofences.forbidden')} · {formatDistanceM(item.radiusM)}
                    {item.notifyOnEnter || item.notifyOnExit ? ` · ${t('geofences.notificationsOn')}` : ''}
                  </Text>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}

      <Pressable
        style={[styles.fab, (limitReached || !activeChild) && styles.fabDisabled]}
        disabled={limitReached || !activeChild}
        onPress={() => router.push({ pathname: '/(main)/geofences/[id]', params: { id: 'new', childId: activeChild?.id ?? '' } })}
        accessibilityRole="button"
        accessibilityState={{ disabled: limitReached || !activeChild }}
        accessibilityLabel={t('geofences.add')}
      >
        <Plus size={26} color={colors.onPrimary} />
      </Pressable>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  backButton: { marginLeft: spacing.xl, marginBottom: spacing.md },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, paddingHorizontal: spacing.xl, marginBottom: spacing.xs },
  subtitle: { ...typography.caption, color: colors.muted, paddingHorizontal: spacing.xl, marginBottom: spacing.xs },
  banner: { paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  fabDisabled: { backgroundColor: colors.muted },
  switcherRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceChip },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  chipTextActive: { color: colors.onPrimary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center' },
  list: { padding: spacing.xl, paddingBottom: 96 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  cardInfo: { flex: 1 },
  cardName: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  cardMeta: { ...typography.caption, color: colors.muted, marginTop: 2 },
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
}));
