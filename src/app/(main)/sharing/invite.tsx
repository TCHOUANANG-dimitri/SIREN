import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Banner, Button, Card, PermissionToggle, TextField } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useCreateShare, useShares } from '@/api/hooks/useSharing';
import { ALL_PERMISSIONS, permissionLabel } from '@/features/sharing/permissions';
import { toUserMessage } from '@/api/errors';
import { SHARING_RULES } from '@/config/business';
import type { Permission } from '@/models/entities';
import { useTranslation } from 'react-i18next';

export default function InviteSecondaryScreen() {
  const { t } = useTranslation();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const createShare = useCreateShare(childId);
  const { data: shares } = useShares(childId);
  const activeCount = (shares ?? []).filter((s) => s.status !== 'revoque').length;
  const limitReached = activeCount >= SHARING_RULES.maxSecondariesPerChild;
  const [identifier, setIdentifier] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function toggle(permission: Permission, value: boolean) {
    setPermissions((prev) => (value ? [...prev, permission] : prev.filter((p) => p !== permission)));
  }

  async function submit() {
    setError(null);
    try {
      await createShare.mutateAsync({ userIdentifier: identifier, permissions });
      setSuccess(true);
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  if (success) {
    return (
      <View style={styles.successContainer}>
        <Banner kind="success" message={t('sharing.inviteSent')} />
        <Button label={t('common.back')} onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton} accessibilityLabel={t('common.back')}>
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title}>{t('sharing.inviteTitle')}</Text>
      <Text style={styles.subtitle}>{t('sharing.inviteSubtitle')}</Text>

      {error && <Banner kind="error" message={error} />}
      {limitReached ? (
        <Banner kind="warning" message={t('errors.secondaryLimit', { max: SHARING_RULES.maxSecondariesPerChild })} />
      ) : (
        <Text style={styles.subtitle}>{t('sharing.slotsLeft', { count: SHARING_RULES.maxSecondariesPerChild - activeCount })}</Text>
      )}

      <TextField
        label={t('sharing.contactField')}
        value={identifier}
        onChangeText={setIdentifier}
        placeholder={t('sharing.contactPlaceholder')}
        autoCapitalize="none"
      />

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('sharing.grantedRights')}</Text>
        {ALL_PERMISSIONS.map((permission) => (
          <PermissionToggle
            key={permission}
            label={permissionLabel(t, permission).label}
            description={permissionLabel(t, permission).description}
            value={permissions.includes(permission)}
            onValueChange={(value) => toggle(permission, value)}
          />
        ))}
      </Card>

      <Card style={styles.previewCard}>
        <Text style={styles.previewTitle}>{t('common.preview')}</Text>
        <Text style={styles.previewText}>
          {permissions.length === 0
            ? t('sharing.previewNone')
            : t('sharing.previewSome', { rights: permissions.map((p) => permissionLabel(t, p).label.toLowerCase()).join(', ') })}
        </Text>
      </Card>

      <Button label={t('sharing.sendInvite')} onPress={submit} loading={createShare.isPending} disabled={identifier.trim().length < 3 || limitReached} />
    </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  backButton: { marginBottom: spacing.lg },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.muted, marginBottom: spacing.xl },
  card: { marginBottom: spacing.lg },
  cardTitle: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.xs },
  previewCard: { backgroundColor: colors.surfaceAlt, marginBottom: spacing.xl },
  previewTitle: { ...typography.label, fontFamily: fontFamily.semiBold, color: colors.primaryDark, marginBottom: 4 },
  previewText: { ...typography.caption, color: colors.primaryDark, lineHeight: 18 },
  successContainer: { flex: 1, backgroundColor: colors.surface, justifyContent: 'center', padding: spacing.xl },
});
