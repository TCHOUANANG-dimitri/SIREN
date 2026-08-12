import { useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Banner, Button, Card, PermissionToggle, Skeleton } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useShare, usePatchShare } from '@/api/hooks/useSharing';
import { ALL_PERMISSIONS, permissionLabels } from '@/features/sharing/permissions';
import type { Permission } from '@/models/entities';

export default function SecondaryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: share } = useShare(id);
  const patchShare = usePatchShare(share?.childId);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!share) return <View style={styles.container}><View style={styles.content}><Skeleton height={200} radius={16} /></View></View>;

  async function togglePermission(permission: Permission, value: boolean) {
    const next = value ? [...share!.permissions, permission] : share!.permissions.filter((p) => p !== permission);
    await patchShare.mutateAsync({ shareId: share!.id, patch: { permissions: next } });
    setFeedback('Droits mis à jour');
    setTimeout(() => setFeedback(null), 1800);
  }

  function confirmRevoke() {
    RNAlert.alert('Révoquer l’accès', `Retirer tous les droits de ${share!.nom} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Révoquer',
        style: 'destructive',
        onPress: async () => {
          await patchShare.mutateAsync({ shareId: share!.id, patch: { status: 'revoque', permissions: [] } });
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton} accessibilityLabel="Retour">
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title}>{share.nom}</Text>
      <Text style={styles.subtitle}>
        Statut : {share.status === 'actif' ? 'Actif' : share.status === 'invite' ? 'Invité' : 'Révoqué'}
      </Text>

      {feedback && <Banner kind="success" message={feedback} />}

      <Card style={styles.card}>
        {ALL_PERMISSIONS.map((permission) => (
          <PermissionToggle
            key={permission}
            label={permissionLabels[permission].label}
            description={permissionLabels[permission].description}
            value={share.permissions.includes(permission)}
            onValueChange={(value) => togglePermission(permission, value)}
            disabled={share.status === 'revoque'}
          />
        ))}
      </Card>

      {share.status !== 'revoque' && <Button label="Révoquer l'accès" variant="secondary" onPress={confirmRevoke} />}
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  backButton: { marginBottom: spacing.lg },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  subtitle: { ...typography.body, color: colors.muted, marginBottom: spacing.xl },
  card: { marginBottom: spacing.xl },
});
