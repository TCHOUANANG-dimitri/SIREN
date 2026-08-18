import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { MapPinOff, Navigation, Search, X } from 'lucide-react-native';
import { Banner, Button, Card, Skeleton } from '@/components';
import { colors, fontFamily, radii, shadow, spacing, typography } from '@/theme';
import { usePosition, useRequestPositionFix, useZoneState } from '@/api/hooks/useTracking';
import { useGeofences } from '@/api/hooks/useGeofences';
import { usePlaces } from '@/api/hooks/usePlaces';
import { useRealtimeChannel } from '@/api/hooks/useRealtimeChannel';
import { useCurrentAccess } from '@/features/sharing/useCurrentAccess';
import { formatRelativeTime } from '@/utils/format';

export function MapTab({ childId }: { childId: string }) {
  useRealtimeChannel(childId);
  const { can, isLoading: accessLoading } = useCurrentAccess(childId);
  const hasPrecise = can('view_position_precise');
  const hasZoneOnly = !hasPrecise && can('view_zone_state');

  if (accessLoading) return null;
  if (hasPrecise) return <PreciseMap childId={childId} />;
  if (hasZoneOnly) return <ZoneStateView childId={childId} />;
  return (
    <View style={styles.center}>
      <MapPinOff size={28} color={colors.muted} />
      <Text style={styles.deniedText}>Vous n&apos;avez pas les droits pour voir la position de cet enfant.</Text>
    </View>
  );
}

function ZoneStateView({ childId }: { childId: string }) {
  const { data: zone, isLoading } = useZoneState(childId, true);
  if (isLoading || !zone) {
    return (
      <View style={styles.center}>
        <Skeleton width="80%" height={80} radius={16} />
      </View>
    );
  }
  return (
    <View style={styles.zoneContainer}>
      <Card style={styles.zoneCard}>
        <Text style={styles.zoneTitle}>{zone.inZone ? `Dans la zone ${zone.zoneName}` : 'Hors des zones connues'}</Text>
        <Text style={styles.zoneMeta}>Mis à jour {formatRelativeTime(zone.asOf)}</Text>
      </Card>
      <Text style={styles.zoneHint}>La position précise n&apos;est pas partagée avec votre accès.</Text>
    </View>
  );
}

function PreciseMap({ childId }: { childId: string }) {
  const { data: position, isLoading } = usePosition(childId);
  const { data: geofences } = useGeofences(childId);
  const { data: places } = usePlaces(childId);
  const requestFix = useRequestPositionFix(childId);
  const mapRef = useRef<MapView>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (position) {
      mapRef.current?.animateToRegion(
        { latitude: position.lat, longitude: position.lon, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        600
      );
    }
  }, [position]);

  if (isLoading || !position) {
    return (
      <View style={styles.center}>
        <Skeleton width="90%" height={280} radius={16} />
      </View>
    );
  }

  const reliability =
    position.fixQuality === 'gps_recent'
      ? { kind: 'success' as const, message: `Position GPS récente — ${formatRelativeTime(position.timestamp)}` }
      : position.fixQuality === 'estimee'
        ? { kind: 'warning' as const, message: 'Position estimée' }
        : { kind: 'error' as const, message: `Signal perdu depuis ${formatRelativeTime(position.timestamp)}` };

  const activeSearch = searchQuery.trim();
  const matchedPlace = places?.find((p) => p.nom.toLowerCase().includes(activeSearch.toLowerCase()));

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{ latitude: position.lat, longitude: position.lon, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
      >
        <Marker coordinate={{ latitude: position.lat, longitude: position.lon }} pinColor={colors.primary} title="Position actuelle" />
        <Circle
          center={{ latitude: position.lat, longitude: position.lon }}
          radius={Math.max(position.accuracyM, 15)}
          strokeColor={colors.primary}
          fillColor="rgba(211,47,46,0.12)"
        />
        {geofences?.map((g) => (
          <Circle
            key={g.id}
            center={{ latitude: g.lat, longitude: g.lon }}
            radius={g.radiusM}
            strokeColor={g.type === 'autorise' ? colors.veille : colors.urgence}
            fillColor={g.type === 'autorise' ? 'rgba(46,125,82,0.08)' : 'rgba(211,47,46,0.08)'}
            strokeWidth={1.5}
          />
        ))}
        {places?.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lon }}
            title={p.nom}
            pinColor={p.source === 'appris' ? colors.prealerte : colors.veille}
          />
        ))}

        {activeSearch !== '' && (
          <Marker
            coordinate={{
              latitude: matchedPlace ? matchedPlace.lat : position.lat + 0.001,
              longitude: matchedPlace ? matchedPlace.lon : position.lon + 0.001,
            }}
            pinColor="#2196F3"
            title={activeSearch}
            description={`Recherche : "${activeSearch}"`}
          />
        )}
      </MapView>

      <View style={styles.overlayTop}>
        <View style={styles.searchBar}>
          <Search size={18} color={colors.slate} style={{ marginRight: spacing.xs }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un nom sur la carte…"
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {activeSearch !== '' && (
          <View style={styles.searchBadge}>
            <Text style={styles.searchBadgeText}>Nom affiché sur la carte : {activeSearch}</Text>
          </View>
        )}

        <Banner kind={reliability.kind} message={reliability.message} />
      </View>

      <View style={styles.overlayBottom}>
        <Button
          label="Demander la position maintenant"
          icon={<Navigation size={16} color={colors.white} />}
          onPress={() => requestFix.mutate()}
          loading={requestFix.isPending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  deniedText: { ...typography.body, color: colors.muted, textAlign: 'center' },
  map: { flex: 1 },
  overlayTop: { position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md, gap: spacing.xs },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.card,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.ink, padding: 0 },
  searchBadge: {
    backgroundColor: '#2196F3',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  searchBadgeText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.white },
  overlayBottom: { position: 'absolute', bottom: spacing.md, left: spacing.md, right: spacing.md },
  zoneContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  zoneCard: { width: '100%', alignItems: 'center' },
  zoneTitle: { ...typography.title2, fontFamily: fontFamily.semiBold, color: colors.ink, textAlign: 'center' },
  zoneMeta: { ...typography.caption, color: colors.muted, marginTop: 4 },
  zoneHint: { ...typography.caption, color: colors.muted, textAlign: 'center' },
});
