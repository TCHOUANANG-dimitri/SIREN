import { useEffect } from 'react';
import { Alert as RNAlert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Plus, ShieldBan, ShieldCheck } from 'lucide-react-native';
import { Card } from '@/components';
import { colors, fontFamily, radii, shadow, spacing, typography } from '@/theme';
import { useChildren } from '@/api/hooks/useChildren';
import { useDeleteGeofence, useGeofences } from '@/api/hooks/useGeofences';
import { useUiStore } from '@/stores/uiStore';

export default function GeofencesListScreen() {
  const { data: children } = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);

  useEffect(() => {
    if (!selectedChildId && children && children.length > 0) setSelectedChildId(children[0].id);
  }, [children, selectedChildId, setSelectedChildId]);

  const activeChild = children?.find((c) => c.id === selectedChildId) ?? children?.[0];
  const { data: geofences } = useGeofences(activeChild?.id);
  const deleteGeofence = useDeleteGeofence(activeChild?.id);

  function confirmDelete(id: string, nom: string) {
    RNAlert.alert('Supprimer le périmètre', `Supprimer « ${nom} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteGeofence.mutate(id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton} accessibilityLabel="Retour">
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title}>Périmètres</Text>

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

      {!geofences || geofences.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucun périmètre. Dessinez une zone autorisée.</Text>
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
                    {item.type === 'autorise' ? 'Zone autorisée' : 'Zone interdite'} · {item.radiusM} m
                    {item.notifyOnEnter || item.notifyOnExit ? ' · Notifications actives' : ''}
                  </Text>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={() => router.push({ pathname: '/(main)/geofences/[id]', params: { id: 'new', childId: activeChild?.id ?? '' } })}
        accessibilityLabel="Ajouter un périmètre"
      >
        <Plus size={26} color={colors.white} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  backButton: { marginLeft: spacing.xl, marginBottom: spacing.md },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  switcherRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceChip },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  chipTextActive: { color: colors.white },
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
});
