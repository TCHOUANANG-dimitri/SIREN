import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MapView, Marker, Polyline } from '@/features/tracking/map';
import { Play, Square } from 'lucide-react-native';
import { Skeleton } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useHistory } from '@/api/hooks/useTracking';
import { formatClock, formatSpeedKmh } from '@/utils/format';
import type { Position } from '@/models/entities';
import { useTranslation } from 'react-i18next';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { historyRange, type HistoryPeriod } from '@/features/tracking/historyRange';

const PERIODS: HistoryPeriod[] = ['today', 'yesterday', '7days', 'custom'];

export function HistoryTab({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<HistoryPeriod>('today');
  const [custom, setCustom] = useState<{ from: Date; to: Date }>(() => ({ from: new Date(), to: new Date() }));
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  // Recalculé quand la période change, et à chaque changement de jour pour « aujourd'hui ».
  const dayKey = new Date().toDateString();
  const { from, to } = useMemo(() => historyRange(period, new Date(dayKey), custom), [period, custom, dayKey]);

  function onPicked(event: DateTimePickerEvent, date?: Date) {
    const step = picking;
    if (Platform.OS === 'android') setPicking(null);
    if (event.type !== 'set' || !date || !step) return;
    setCustom((c) => ({ ...c, [step]: date }));
    setPeriod('custom');
    // Enchaîne sur la date de fin après la date de début.
    if (step === 'from') setPicking('to');
    else setPicking(null);
  }
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
        {PERIODS.map((p) => (
          <Pressable
            key={p}
            onPress={() => (p === 'custom' ? setPicking('from') : setPeriod(p))}
            style={[styles.chip, period === p && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p }}
          >
            <Text style={[styles.chipText, period === p && styles.chipTextActive]}>
              {p === 'custom' && period === 'custom'
                ? `${custom.from.toLocaleDateString()} → ${custom.to.toLocaleDateString()}`
                : t(`history.period.${p}`)}
            </Text>
          </Pressable>
        ))}
        {positions && positions.length > 1 && (
          <Pressable
            onPress={() => setPlayIndex(playIndex === null ? 0 : null)}
            style={styles.playButton}
            accessibilityLabel={t('history.play')}
          >
            {playIndex === null ? (
              <Play size={16} color={colors.primary} />
            ) : (
              <Square size={16} color={colors.primary} />
            )}
          </Pressable>
        )}
      </View>

      {picking && (
        <DateTimePicker
          value={custom[picking]}
          mode="date"
          maximumDate={new Date()}
          onChange={onPicked}
        />
      )}

      {isLoading ? (
        <View style={styles.padded}>
          <Skeleton height={200} radius={16} />
        </View>
      ) : !positions || positions.length === 0 ? (
        <View style={styles.padded}>
          <Text style={styles.emptyText}>{t('childTabs.noHistory')}</Text>
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
            <Marker coordinate={coords[0]} pinColor={colors.veille} title={t('childTabs.departure')} />
            <Marker coordinate={coords[coords.length - 1]} pinColor={colors.primary} title={t('childTabs.arrival')} />
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
