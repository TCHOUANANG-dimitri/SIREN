import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Banner, Button, Card, PermissionToggle, TextField } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useCreateShare } from '@/api/hooks/useSharing';
import { ALL_PERMISSIONS, permissionLabels } from '@/features/sharing/permissions';
import { ApiError } from '@/api/network';
import type { Permission } from '@/models/entities';

export default function InviteSecondaryScreen() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const createShare = useCreateShare(childId);
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
      setError(e instanceof ApiError ? e.message : 'Une erreur est survenue.');
    }
  }

  if (success) {
    return (
      <View style={styles.successContainer}>
        <Banner kind="success" message="Invitation envoyée — la personne apparaît en statut « invité »." />
        <Button label="Retour" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title}>Inviter un secondaire</Text>
      <Text style={styles.subtitle}>Ajoutez une personne et définissez ses droits initiaux.</Text>

      {error && <Banner kind="error" message={error} />}

      <TextField
        label="Téléphone ou email"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="rose@example.com"
        autoCapitalize="none"
      />

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Droits accordés</Text>
        {ALL_PERMISSIONS.map((permission) => (
          <PermissionToggle
            key={permission}
            label={permissionLabels[permission].label}
            description={permissionLabels[permission].description}
            value={permissions.includes(permission)}
            onValueChange={(value) => toggle(permission, value)}
          />
        ))}
      </Card>

      <Card style={styles.previewCard}>
        <Text style={styles.previewTitle}>Aperçu</Text>
        <Text style={styles.previewText}>
          {permissions.length === 0
            ? "Cette personne ne verra aucune information tant qu'aucun droit n'est accordé."
            : `Cette personne pourra voir : ${permissions.map((p) => permissionLabels[p].label.toLowerCase()).join(', ')}.`}
        </Text>
      </Card>

      <Button label="Envoyer l'invitation" onPress={submit} loading={createShare.isPending} disabled={identifier.trim().length < 3} />
    </ScrollView>
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
