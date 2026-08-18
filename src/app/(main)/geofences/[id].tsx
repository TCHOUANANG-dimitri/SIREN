import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Button, PermissionToggle, Skeleton, TextField } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { MapPointRadiusPicker } from '@/features/tracking/MapPointRadiusPicker';
import { useGeofences, useCreateGeofence, usePatchGeofence } from '@/api/hooks/useGeofences';
import { usePosition } from '@/api/hooks/useTracking';
import type { Geofence } from '@/models/entities';

export default function GeofenceEditorScreen() {
  const { id, childId } = useLocalSearchParams<{ id: string; childId: string }>();
  const isNew = id === 'new';
  const { data: geofences } = useGeofences(childId);
  const existing = geofences?.find((g) => g.id === id);
  const { data: position } = usePosition(childId);
  const createGeofence = useCreateGeofence(childId);
  const patchGeofence = usePatchGeofence(childId);

  const [nom, setNom] = useState('');
  const [type, setType] = useState<Geofence['type']>('autorise');
  const [point, setPoint] = useState({ lat: 0, lon: 0, radiusM: 500 });
  const [notifyOnEnter, setNotifyOnEnter] = useState(true);
  const [notifyOnExit, setNotifyOnExit] = useState(true);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (initialised) return;
    if (!isNew && existing) {
      setNom(existing.nom);
      setType(existing.type);
      setPoint({ lat: existing.lat, lon: existing.lon, radiusM: existing.radiusM });
      setNotifyOnEnter(existing.notifyOnEnter);
      setNotifyOnExit(existing.notifyOnExit);
      setInitialised(true);
    } else if (isNew && position) {
      setPoint({ lat: position.lat, lon: position.lon, radiusM: 500 });
      setInitialised(true);
    }
  }, [isNew, existing, position, initialised]);

  async function save() {
    if (isNew) {
      await createGeofence.mutateAsync({ nom, type, lat: point.lat, lon: point.lon, radiusM: point.radiusM, notifyOnEnter, notifyOnExit });
    } else if (existing) {
      await patchGeofence.mutateAsync({
        geofenceId: existing.id,
        patch: { nom, type, lat: point.lat, lon: point.lon, radiusM: point.radiusM, notifyOnEnter, notifyOnExit },
      });
    }
    router.back();
  }

  if (!initialised) return <SafeAreaView style={styles.container} edges={['top']}><View style={styles.content}><Skeleton height={300} radius={16} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton} accessibilityLabel="Retour">
        <ArrowLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title}>{isNew ? 'Nouveau périmètre' : 'Modifier le périmètre'}</Text>

      <TextField label="Nom" value={nom} onChangeText={setNom} placeholder="Quartier, trajet école…" />

      <View style={styles.typeRow}>
        <Pressable style={[styles.typeChip, type === 'autorise' && styles.typeChipAutorise]} onPress={() => setType('autorise')}>
          <Text style={[styles.typeChipText, type === 'autorise' && styles.typeChipTextActive]}>Autorisé</Text>
        </Pressable>
        <Pressable style={[styles.typeChip, type === 'interdit' && styles.typeChipInterdit]} onPress={() => setType('interdit')}>
          <Text style={[styles.typeChipText, type === 'interdit' && styles.typeChipTextActive]}>Interdit</Text>
        </Pressable>
      </View>

      <MapPointRadiusPicker
        latitude={point.lat}
        longitude={point.lon}
        radiusM={point.radiusM}
        minRadius={100}
        maxRadius={5000}
        height={220}
        onChange={(v) => setPoint(v)}
      />

      <PermissionToggle label="Notifier à l'entrée" value={notifyOnEnter} onValueChange={setNotifyOnEnter} />
      <PermissionToggle label="Notifier à la sortie" value={notifyOnExit} onValueChange={setNotifyOnExit} />

      <Button
        label="Enregistrer"
        onPress={save}
        loading={createGeofence.isPending || patchGeofence.isPending}
        disabled={nom.trim().length < 2}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  backButton: { marginBottom: spacing.lg },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.lg },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  typeChip: { flex: 1, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surfaceChip, alignItems: 'center' },
  typeChipAutorise: { backgroundColor: colors.veille },
  typeChipInterdit: { backgroundColor: colors.urgence },
  typeChipText: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.muted },
  typeChipTextActive: { color: colors.white },
});
