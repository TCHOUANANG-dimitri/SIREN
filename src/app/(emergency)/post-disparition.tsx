import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import MapView, { Circle, Marker } from 'react-native-maps';
import { AlertOctagon, Share2, Users } from 'lucide-react-native';
import { Banner, Button, Card, Skeleton } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useSearchZone } from '@/api/hooks/useSearchZone';
import { useChildren } from '@/api/hooks/useChildren';
import { useShares } from '@/api/hooks/useSharing';
import { formatClock } from '@/utils/format';

export default function PostDisappearanceScreen() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { data: zone, isLoading } = useSearchZone(childId, true);
  const { data: children } = useChildren();
  const { data: shares } = useShares(childId);
  const child = children?.find((c) => c.id === childId);
  const [notified, setNotified] = useState(false);

  const activeSecondaries = (shares ?? []).filter((s) => s.status === 'actif');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <AlertOctagon size={26} color={colors.white} />
        <Text style={styles.headerTitle}>Mode post-disparition</Text>
        <Text style={styles.headerSubtitle}>{child?.prenom}</Text>
      </View>

      {isLoading || !zone ? (
        <View style={styles.padded}>
          <Banner kind="warning" message="Calcul de la zone de recherche…" />
          <View style={{ height: spacing.md }} />
          <Skeleton height={220} radius={16} />
        </View>
      ) : (
        <>
          <View style={styles.padded}>
            <Banner
              kind="warning"
              message={`Fiabilité de la zone en baisse avec le temps — confiance actuelle ${Math.round(zone.confidence)}%`}
            />
          </View>

          <View style={styles.mapWrapper}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: zone.lastPoint.lat,
                longitude: zone.lastPoint.lon,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              }}
            >
              <Marker coordinate={{ latitude: zone.lastPoint.lat, longitude: zone.lastPoint.lon }} pinColor={colors.urgence} title="Dernier point connu" />
              {zone.cells.map((cell, i) => (
                <Circle
                  key={i}
                  center={{ latitude: cell.lat, longitude: cell.lon }}
                  radius={400}
                  strokeColor="transparent"
                  fillColor={`rgba(211,47,46,${0.35 * cell.weight})`}
                />
              ))}
            </MapView>
          </View>

          <View style={styles.padded}>
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Zones prioritaires</Text>
              {zone.topZones.map((z) => (
                <Text key={z.rank} style={styles.zoneItem}>
                  {z.rank}. {z.label}
                </Text>
              ))}
            </Card>

            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Fiche de disparition</Text>
              <View style={styles.ficheRow}>
                {child?.photoUrl ? (
                  <Image source={{ uri: child.photoUrl }} style={styles.fichePhoto} />
                ) : (
                  <View style={styles.fichePhotoPlaceholder}>
                    <Text style={styles.fichePhotoInitial}>{child?.prenom.charAt(0)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.ficheName}>{child?.prenom}</Text>
                  <Text style={styles.ficheMeta}>Dernière position : {formatClock(zone.lastPoint.timestamp)}</Text>
                  <Text style={styles.ficheMeta}>Généré à {formatClock(zone.generatedAt)}</Text>
                </View>
              </View>
            </Card>

            {notified && <Banner kind="success" message={`${activeSecondaries.length} proche(s) notifié(s).`} />}

            <View style={{ height: spacing.md }} />
            <Button
              label="Partager la fiche"
              icon={<Share2 size={16} color={colors.white} />}
              onPress={() => {}}
              style={{ marginBottom: spacing.sm }}
            />
            <Button
              label={`Notifier le cercle de confiance (${activeSecondaries.length})`}
              icon={<Users size={16} color={colors.primary} />}
              variant="secondary"
              onPress={() => setNotified(true)}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.disparition },
  content: { paddingBottom: spacing.xxxl },
  header: { padding: spacing.xxl, paddingTop: spacing.xxxl, alignItems: 'center', gap: spacing.sm },
  headerTitle: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.white },
  headerSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)' },
  padded: { padding: spacing.lg },
  mapWrapper: { marginHorizontal: spacing.lg, borderRadius: 16, overflow: 'hidden' },
  map: { height: 240 },
  card: { marginBottom: spacing.md, backgroundColor: colors.white },
  cardTitle: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.sm },
  zoneItem: { ...typography.body, color: colors.slate, marginBottom: 4 },
  ficheRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  fichePhoto: { width: 56, height: 56, borderRadius: 28 },
  fichePhotoPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  fichePhotoInitial: { ...typography.title2, fontFamily: fontFamily.bold, color: colors.primary },
  ficheName: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  ficheMeta: { ...typography.caption, color: colors.muted },
});
