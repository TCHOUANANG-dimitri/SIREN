import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Home, MapPin, Plus, School } from 'lucide-react-native';
import { Banner, BottomSheet, Button, Card, Skeleton, TextField } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { usePlaces, usePatchPlace, useCreatePlace } from '@/api/hooks/usePlaces';
import { useChildren } from '@/api/hooks/useChildren';
import { usePosition } from '@/api/hooks/useTracking';
import type { Place } from '@/models/entities';

const iconFor = (place: Place) => {
  if (place.icon === 'maison') return Home;
  if (place.icon === 'ecole') return School;
  return MapPin;
};

export function PlacesTab({ childId }: { childId: string }) {
  const { data: children } = useChildren();
  const child = children?.find((c) => c.id === childId);
  const { data: places, isLoading } = usePlaces(childId);
  const { data: currentPosition } = usePosition(childId);
  const patchPlace = usePatchPlace(childId);
  const createPlace = useCreatePlace(childId);

  const [editing, setEditing] = useState<Place | null>(null);
  const [editName, setEditName] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');

  function openEdit(place: Place) {
    setEditing(place);
    setEditName(place.nom);
  }

  async function saveEdit() {
    if (!editing) return;
    await patchPlace.mutateAsync({ placeId: editing.id, patch: { nom: editName, isNew: false } });
    setEditing(null);
  }

  async function addPlace() {
    if (!newName.trim()) return;
    await createPlace.mutateAsync({
      nom: newName.trim(),
      lat: currentPosition?.lat ?? 0,
      lon: currentPosition?.lon ?? 0,
      radiusM: 80,
      icon: 'lieu',
    });
    setNewName('');
    setAddOpen(false);
  }

  if (isLoading) return <View style={styles.padded}><Skeleton height={200} radius={16} /></View>;

  return (
    <View style={styles.flex}>
      {child && child.modelConfidence < 40 && (
        <View style={styles.padded}>
          <Banner kind="info" message={`L'IA apprend encore les lieux de votre enfant — confiance ${Math.round(child.modelConfidence)}%.`} />
        </View>
      )}

      {!places || places.length === 0 ? (
        <View style={styles.padded}>
          <Text style={styles.emptyText}>Aucun lieu pour le moment.</Text>
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const Icon = iconFor(item);
            return (
              <Pressable onPress={() => openEdit(item)}>
                <Card style={styles.card}>
                  <View style={styles.iconWrap}>
                    <Icon size={18} color={colors.primary} />
                  </View>
                  <View style={styles.info}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{item.nom}</Text>
                      {item.isNew && (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>Nouveau</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.sourceBadge}>{item.source === 'appris' ? 'Appris' : 'Déclaré'}</Text>
                    {item.schedule?.[0] && (
                      <Text style={styles.schedule}>
                        {item.schedule[0].heureDebut} – {item.schedule[0].heureFin}
                      </Text>
                    )}
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        <Button label="Ajouter un lieu" icon={<Plus size={16} color={colors.white} />} onPress={() => setAddOpen(true)} />
      </View>

      <BottomSheet visible={!!editing} onClose={() => setEditing(null)}>
        <Text style={styles.sheetTitle}>Renommer le lieu</Text>
        <TextField label="Nom" value={editName} onChangeText={setEditName} />
        <Button label="Enregistrer" onPress={saveEdit} loading={patchPlace.isPending} />
      </BottomSheet>

      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)}>
        <Text style={styles.sheetTitle}>Ajouter un lieu</Text>
        <TextField label="Nom du lieu" value={newName} onChangeText={setNewName} placeholder="Église, marché…" />
        <Button label="Ajouter" onPress={addPlace} loading={createPlace.isPending} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: spacing.lg },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  list: { padding: spacing.lg, gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  newBadge: { backgroundColor: colors.prealerteSurface, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  newBadgeText: { ...typography.label, fontFamily: fontFamily.semiBold, color: colors.prealerte },
  sourceBadge: { ...typography.caption, color: colors.muted, marginTop: 2 },
  schedule: { ...typography.caption, color: colors.muted, marginTop: 2 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  sheetTitle: { ...typography.title2, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.lg },
});
