import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Card, PermissionToggle, TextField } from '@/components';
import { fontFamily, spacing, touchTarget, typography, makeStyles, useTheme } from '@/theme';
import { useCreateShare, useShares } from '@/api/hooks/useSharing';
import { useChildren } from '@/api/hooks/useChildren';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { ALL_PERMISSIONS, permissionLabel } from '@/features/sharing/permissions';
import { activeShareCount, checkInvite } from '@/features/sharing/inviteRules';
import { reasonMessage, toUserMessage } from '@/api/errors';
import { SHARING_RULES } from '@/config/business';
import type { Permission } from '@/models/entities';

type Outcome = { name: string; notified: boolean };

export default function InviteSecondaryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const user = useAuthStore((s) => s.user);
  const online = useUiStore((s) => s.deviceOnline);
  const { data: children } = useChildren();
  const child = children?.find((c) => c.id === childId);
  const createShare = useCreateShare(childId);
  const { data: shares } = useShares(childId);
  const activeCount = activeShareCount(shares);
  const limitReached = activeCount >= SHARING_RULES.maxSecondariesPerChild;
  const [identifier, setIdentifier] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Verrou synchrone : un double appui ne peut pas créer deux invitations.
  const submitting = useRef(false);

  function toggle(permission: Permission, value: boolean) {
    setPermissions((prev) => (value ? [...prev, permission] : prev.filter((p) => p !== permission)));
  }

  async function submit() {
    if (submitting.current || !childId) return;
    setError(null);
    const check = checkInvite({ raw: identifier, user, shares });
    if (!check.ok) {
      const message =
        check.reason === 'empty'
          ? t('validation.required')
          : reasonMessage(check.reason, { max: SHARING_RULES.maxSecondariesPerChild }) ?? t('apiErrors.validation');
      if (check.reason === 'secondary_limit') setError(message);
      else setFieldError(message);
      return;
    }
    submitting.current = true;
    try {
      const result = await createShare.mutateAsync({ userIdentifier: check.identifier, permissions });
      setOutcome({ name: result.share.nom, notified: result.notified });
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      submitting.current = false;
    }
  }

  if (outcome) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.successContainer}>
          <Banner
            kind="success"
            message={t(outcome.notified ? 'sharing.inviteCreatedNotified' : 'sharing.inviteCreated', {
              name: outcome.name,
              child: child?.prenom ?? '',
            })}
          />
          <Button label={t('common.back')} onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">{t('sharing.inviteTitle')}</Text>
          {child && <Text style={styles.childLine}>{t('sharing.forChild', { name: child.prenom })}</Text>}
          <Text style={styles.subtitle}>{t('sharing.inviteSubtitle')}</Text>

          {!online && <Banner kind="warning" message={t('sharing.offline')} />}
          {error && <Banner kind="error" message={error} />}
          {limitReached ? (
            <Banner kind="warning" message={t('apiErrors.reasons.secondary_limit', { max: SHARING_RULES.maxSecondariesPerChild })} />
          ) : (
            <Text style={styles.slots}>{t('sharing.slotsLeft', { count: SHARING_RULES.maxSecondariesPerChild - activeCount })}</Text>
          )}

          <TextField
            label={t('sharing.contactField')}
            value={identifier}
            onChangeText={(value) => {
              setIdentifier(value);
              setFieldError(undefined);
            }}
            placeholder={t('sharing.contactPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            error={fieldError}
          />
          <Text style={styles.help}>{t('sharing.contactHelp')}</Text>

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
                : t('sharing.previewSome', { rights: permissions.map((p) => permissionLabel(t, p).label).join(', ') })}
            </Text>
          </Card>

          <Button
            label={t('sharing.sendInvite')}
            onPress={submit}
            loading={createShare.isPending}
            disabled={identifier.trim().length === 0 || limitReached || !online || !childId}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  slots: { ...typography.caption, color: colors.muted, marginBottom: spacing.sm },
  help: { ...typography.caption, color: colors.muted, marginTop: -spacing.sm, marginBottom: spacing.md },
  card: { marginBottom: spacing.lg },
  cardTitle: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.xs },
  previewCard: { backgroundColor: colors.surfaceAlt, marginBottom: spacing.xl },
  previewTitle: { ...typography.label, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: 4 },
  previewText: { ...typography.caption, color: colors.ink, lineHeight: 18 },
  successContainer: { flex: 1, justifyContent: 'center', padding: spacing.xl },
}));
