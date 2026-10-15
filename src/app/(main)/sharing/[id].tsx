import { useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Card, PermissionToggle, Skeleton } from '@/components';
import { fontFamily, spacing, touchTarget, typography, makeStyles, useTheme } from '@/theme';
import { useShare, usePatchShare } from '@/api/hooks/useSharing';
import { useChildren } from '@/api/hooks/useChildren';
import { toUserMessage } from '@/api/errors';
import { ALL_PERMISSIONS, permissionLabel } from '@/features/sharing/permissions';
import type { Permission } from '@/models/entities';

export default function SecondaryDetailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const shareQuery = useShare(id);
  const share = shareQuery.data;
  const { data: children } = useChildren();
  const child = children?.find((c) => c.id === share?.childId);
  const patchShare = usePatchShare(share?.childId);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  if (shareQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.content}>
          <Banner kind="error" message={toUserMessage(shareQuery.error)} />
          <Button label={t('common.back')} variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (!share) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Skeleton height={200} radius={16} />
        </View>
      </View>
    );
  }

  const current = share;

  async function togglePermission(permission: Permission, value: boolean) {
    const next = value ? [...current.permissions, permission] : current.permissions.filter((p) => p !== permission);
    setFeedback(null);
    try {
      await patchShare.mutateAsync({ shareId: current.id, patch: { permissions: next } });
      setFeedback({ kind: 'success', message: t('sharing.rightsUpdated') });
    } catch (e) {
      setFeedback({ kind: 'error', message: toUserMessage(e) });
    }
  }

  function confirmRevoke() {
    RNAlert.alert(t('sharing.revokeAccess'), t('sharing.revokeConfirm', { name: current.nom }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('sharing.revoke'),
        style: 'destructive',
        onPress: async () => {
          try {
            await patchShare.mutateAsync({ shareId: current.id, patch: { status: 'revoque', permissions: [] } });
            router.back();
          } catch (e) {
            setFeedback({ kind: 'error', message: toUserMessage(e) });
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">{share.nom}</Text>
        {child && <Text style={styles.childLine}>{t('sharing.forChild', { name: child.prenom })}</Text>}
        <Text style={styles.subtitle}>{t('sharing.statusLine', { status: t(`sharing.status.${share.status}`) })}</Text>

        {feedback && <Banner kind={feedback.kind} message={feedback.message} />}

        <Card style={styles.card}>
          {ALL_PERMISSIONS.map((permission) => (
            <PermissionToggle
              key={permission}
              label={permissionLabel(t, permission).label}
              description={permissionLabel(t, permission).description}
              value={share.permissions.includes(permission)}
              onValueChange={(value) => togglePermission(permission, value)}
              disabled={share.status === 'revoque' || patchShare.isPending}
            />
          ))}
        </Card>

        {share.status !== 'revoque' && (
          <Button label={t('sharing.revokeAccess')} variant="secondary" onPress={confirmRevoke} loading={patchShare.isPending} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.sm },
  backButton: { width: touchTarget.min, height: touchTarget.min, justifyContent: 'center', marginLeft: -spacing.sm },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  childLine: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.accent },
  subtitle: { ...typography.body, color: colors.muted, marginBottom: spacing.md },
  card: { marginBottom: spacing.xl },
}));
