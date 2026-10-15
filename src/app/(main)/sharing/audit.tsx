import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, SkeletonCard } from '@/components';
import { fontFamily, spacing, touchTarget, typography, makeStyles, useTheme } from '@/theme';
import { useAccessAudit } from '@/api/hooks/useSharing';
import { toUserMessage } from '@/api/errors';
import { ChildSelector } from '@/features/children/ChildSelector';
import { useSelectedChild } from '@/features/children/useSelectedChild';
import { auditInfoLabel } from '@/features/sharing/permissions';
import { formatClock, formatRelativeTime } from '@/utils/format';

export default function AccessAuditScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { children, activeChild, select } = useSelectedChild();
  const audit = useAccessAudit(activeChild?.id);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">{t('sharing.auditTitle')}</Text>

      <ChildSelector
        childrenList={children ?? []}
        activeId={activeChild?.id}
        onSelect={select}
        contextLabel={t('sharing.auditTitle')}
      />

      {audit.isError ? (
        <View style={styles.list}>
          <Banner kind="error" message={toUserMessage(audit.error)} />
        </View>
      ) : audit.isLoading ? (
        <View style={styles.list}>
          <SkeletonCard />
        </View>
      ) : !audit.data || audit.data.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('sharing.auditEmpty')}</Text>
        </View>
      ) : (
        <FlatList
          data={audit.data}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>{item.secondaryNom}</Text>
                <Text style={styles.rowInfo}>{auditInfoLabel(t, item.infoType)}</Text>
              </View>
              <Text style={styles.rowTime}>{formatClock(item.timestamp)} · {formatRelativeTime(item.timestamp)}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  backButton: { marginLeft: spacing.md, width: touchTarget.min, height: touchTarget.min, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center' },
  list: { padding: spacing.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowMain: { flex: 1 },
  rowName: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  rowInfo: { ...typography.caption, color: colors.muted },
  rowTime: { ...typography.caption, color: colors.muted },
}));
