import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Home, MapPin, Plus, School } from 'lucide-react-native';
import { Banner, BottomSheet, Button, Card, Skeleton, TextField } from '@/components';
import { fontFamily, radii, spacing, typography, makeStyles, useTheme } from '@/theme';
import { usePlaces, usePatchPlace, useCreatePlace } from '@/api/hooks/usePlaces';
import { useChildren } from '@/api/hooks/useChildren';
import { usePosition } from '@/api/hooks/useTracking';
import type { Place } from '@/models/entities';
import { useTranslation } from 'react-i18next';
import { toUserMessage } from '@/api/errors';
import { useCurrentAccess } from '@/features/sharing/useCurrentAccess';
import { CONFIG_LIMITS, DEFAULT_PLACE_RADIUS_M } from '@/config/business';

const iconFor = (place: Place) => {
  if (place.icon === 'maison') return Home;
  if (place.icon === 'ecole') return School;
  return MapPin;
};

export function PlacesTab({ childId }: { childId: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
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
  const [addError, setAddError] = useState<string | null>(null);
  const { can } = useCurrentAccess(childId);
  const canEdit = can('edit_geofences');

  function openEdit(place: Place) {
    setEditing(place);
    setEditName(place.nom);
  }

  async function saveEdit() {
    if (!editing) return;
    await patchPlace.mutateAsync({ placeId: editing.id, patch: { nom: editName, isNew: false } });
    setEditing(null);
  }

  // Le lieu est créé à la position actuelle de l'enfant : sans position connue,
  // on ne crée rien (jamais de coordonnées par défaut inventées).
  const canAddHere = !!currentPosition;
  const limitReached = (places?.length ?? 0) >= CONFIG_LIMITS.placesPerChild;

  async function addPlace() {
    const nom = newName.trim();
    if (!nom || !currentPosition) return;
    if (places?.some((p) => p.nom.toLocaleLowerCase() === nom.toLocaleLowerCase())) {
      setAddError(t('wizard.placeNameDuplicate'));
      return;
    }
    setAddError(null);
    try {
      await createPlace.mutateAsync({
        nom,
        lat: currentPosition.lat,
        lon: currentPosition.lon,
        radiusM: DEFAULT_PLACE_RADIUS_M,
        icon: 'lieu',
      });
      setNewName('');
      setAddOpen(false);
    } catch (e) {
      setAddError(toUserMessage(e));
    }
  }

  async function saveEditSafely() {
    setAddError(null);
    try {
      await saveEdit();
    } catch (e) {
      setAddError(toUserMessage(e));
    }
  }

  if (isLoading) return <View style={styles.padded}><Skeleton height={200} radius={16} /></View>;

  return (
    <View style={styles.flex}>
      {child && child.modelConfidence < 40 && (
        <View style={styles.padded}>
          <Banner kind="info" message={t('childTabs.placesLearning', { percent: Math.round(child.modelConfidence) })} />
        </View>
      )}

      {!places || places.length === 0 ? (
        <View style={styles.padded}>
          <Text style={styles.emptyText}>{t('childTabs.noPlaces')}</Text>
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
                    <Icon size={18} color={colors.accent} />
                  </View>
                  <View style={styles.info}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{item.nom}</Text>
                      {item.isNew && (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>{t('common.new')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.sourceBadge}>{t(item.source === 'appris' ? 'childTabs.placeLearned' : 'childTabs.placeDeclared')}</Text>
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

      {canEdit && (
        <View style={styles.footer}>
          {limitReached && <Banner kind="warning" message={t('apiErrors.reasons.place_limit', { max: CONFIG_LIMITS.placesPerChild })} />}
          <Button
            label={t('childTabs.addPlace')}
            icon={<Plus size={16} color={colors.onPrimary} />}
            onPress={() => {
              setAddError(null);
              setAddOpen(true);
            }}
            disabled={limitReached}
          />
        </View>
      )}

      <BottomSheet visible={!!editing} onClose={() => setEditing(null)}>
        <Text style={styles.sheetTitle}>{t('childTabs.renamePlace')}</Text>
        <TextField label={t('common.name')} value={editName} onChangeText={setEditName} />
        {addError && editing && <Banner kind="error" message={addError} />}
        <Button label={t('common.save')} onPress={saveEditSafely} loading={patchPlace.isPending} disabled={!canEdit || !editName.trim()} />
      </BottomSheet>

      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)}>
        <Text style={styles.sheetTitle}>{t('childTabs.addPlace')}</Text>
        <Text style={styles.sheetHint}>{t(canAddHere ? 'childTabs.addPlaceHere' : 'childTabs.addPlaceNoPosition')}</Text>
        {addError && !editing && <Banner kind="error" message={addError} />}
        <TextField label={t('wizard.placeName')} value={newName} onChangeText={setNewName} placeholder={t('wizard.placeNamePlaceholder')} />
        <Button label={t('common.add')} onPress={addPlace} loading={createPlace.isPending} disabled={!canAddHere || !newName.trim()} />
      </BottomSheet>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
  sheetHint: { ...typography.caption, color: colors.muted, marginBottom: spacing.md },
  sheetTitle: { ...typography.title2, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.lg },
}));
