import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Play, Square } from 'lucide-react-native';
import { Skeleton } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useHistory } from '@/api/hooks/useTracking';
import { formatClock, formatSpeedKmh } from '@/utils/format';
import type { Position } from '@/models/entities';

type Period = 'today' | 'yesterday' | '7days';

function periodRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  if (period === 'today') return { from: startOfDay(now), to: now.toISOString() };
  if (period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: startOfDay(yesterday), to: startOfDay(now) };
  }
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return { from: weekAgo.toISOString(), to: now.toISOString() };
}

export function HistoryTab({ childId }: { childId: string }) {
  const [period, setPeriod] = useState<Period>('today');
  const { from, to } = useMemo(() => periodRange(period), [period]);
  const { data: positions, isLoading } = useHistory(childId, from, to);
  const [playIndex, setPlayIndex] = useState<number | null>(null);

  useEffect(() => {
    if (playIndex === null || !positions) return;
    if (playIndex >= positions.length - 1) {
      const timeout = setTimeout(() => setPlayIndex(null), 800);
      return () => clearTimeout(timeout);
    }
    const timer = setTimeout(() => setPlayIndex((i) => (i ?? 0) + 1), 400);
    return () => clearTimeout(timer);
  }, [playIndex, positions]);

  const coords = (positions ?? []).map((p) => ({ latitude: p.lat, longitude: p.lon }));

  return (
    <View style={styles.flex}>
      <View style={styles.periodRow}>
        {(['today', 'yesterday', '7days'] as Period[]).map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.chip, period === p && styles.chipActive]}>
            <Text style={[styles.chipText, period === p && styles.chipTextActive]}>
              {p === 'today' ? "Aujourd'hui" : p === 'yesterday' ? 'Hier' : '7 jours'}
            </Text>
          </Pressable>
        ))}
        {positions && positions.length > 1 && (
          <Pressable
            onPress={() => setPlayIndex(playIndex === null ? 0 : null)}
            style={styles.playButton}
            accessibilityLabel="Lire le trajet"
          >
            {playIndex === null ? (
              <Play size={16} color={colors.primary} />
            ) : (
              <Square size={16} color={colors.primary} />
            )}
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.padded}>
          <Skeleton height={200} radius={16} />
        </View>
      ) : !positions || positions.length === 0 ? (
        <View style={styles.padded}>
          <Text style={styles.emptyText}>Aucun déplacement enregistré sur cette période.</Text>
        </View>
      ) : (
        <>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: positions[positions.length - 1].lat,
              longitude: positions[positions.length - 1].lon,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            <Polyline coordinates={coords} strokeColor={colors.primary} strokeWidth={3} />
            <Marker coordinate={coords[0]} pinColor={colors.veille} title="Départ" />
            <Marker coordinate={coords[coords.length - 1]} pinColor={colors.primary} title="Arrivée" />
            {playIndex !== null && positions[playIndex] && (
              <Marker coordinate={{ latitude: positions[playIndex].lat, longitude: positions[playIndex].lon }}>
                <View style={styles.playMarker} />
              </Marker>
            )}
          </MapView>

          <FlatList
            data={[...positions].reverse()}
            keyExtractor={(item, index) => `${item.timestamp}-${index}`}
            contentContainerStyle={styles.list}
            renderItem={({ item }: { item: Position }) => (
              <View style={styles.row}>
                <Text style={styles.rowTime}>{formatClock(item.timestamp)}</Text>
                <Text style={styles.rowSpeed}>{formatSpeedKmh(item.speedKmh)}</Text>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceChip },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  chipTextActive: { color: colors.white },
  playButton: { marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  padded: { padding: spacing.lg },
  emptyText: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  map: { height: 200 },
  playMarker: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.prealerte, borderWidth: 2, borderColor: colors.white },
  list: { padding: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTime: { ...typography.body, fontFamily: fontFamily.medium, color: colors.ink },
  rowSpeed: { ...typography.caption, color: colors.muted },
});
