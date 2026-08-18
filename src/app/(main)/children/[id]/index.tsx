import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, BatteryMedium, Wifi, WifiOff } from 'lucide-react-native';
import { SegmentedTabs, StateBadge } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useChildren, useChildStatus } from '@/api/hooks/useChildren';
import { useRisk } from '@/api/hooks/useRisk';
import { useCurrentAccess } from '@/features/sharing/useCurrentAccess';
import { MapTab } from '@/features/children/tabs/MapTab';
import { HistoryTab } from '@/features/children/tabs/HistoryTab';
import { PlacesTab } from '@/features/children/tabs/PlacesTab';
import { RiskTab } from '@/features/children/tabs/RiskTab';
import { DeviceTab } from '@/features/children/tabs/DeviceTab';

type TabKey = 'carte' | 'historique' | 'lieux' | 'score' | 'dispositif';

export default function ChildDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>('carte');

  const { data: children } = useChildren();
  const child = children?.find((c) => c.id === id);
  const { data: status } = useChildStatus(id);
  const { data: risk } = useRisk(id);
  const { can } = useCurrentAccess(id);

  const availableTabs = (
    [
      { key: 'carte' as const, label: 'Carte', visible: can('view_position_precise') || can('view_zone_state') },
      { key: 'historique' as const, label: 'Historique', visible: can('view_history') },
      { key: 'lieux' as const, label: 'Lieux', visible: true },
      { key: 'score' as const, label: 'Score', visible: true },
      { key: 'dispositif' as const, label: 'Dispositif', visible: can('configure_device') },
    ] satisfies { key: TabKey; label: string; visible: boolean }[]
  ).filter((t) => t.visible);

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some((t) => t.key === tab)) {
      setTab(availableTabs[0].key);
    }
  }, [availableTabs, tab]);

  const showEmergencyButton = risk?.state === 'prealerte' || risk?.state === 'urgence';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Retour">
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{child?.prenom ?? '…'}</Text>
          <View style={styles.headerMeta}>
            {risk && <StateBadge state={risk.state} compact />}
            {status && (
              <View style={styles.metaItem}>
                <BatteryMedium size={13} color={colors.muted} />
                <Text style={styles.metaText}>{status.battery}%</Text>
              </View>
            )}
            {status &&
              (status.online ? (
                <Wifi size={13} color={colors.veille} />
              ) : (
                <WifiOff size={13} color={colors.urgence} />
              ))}
          </View>
        </View>
      </View>

      <SegmentedTabs tabs={availableTabs} activeKey={tab} onChange={setTab} />

      <View style={styles.tabContent}>
        {!id ? null : tab === 'carte' ? (
          <MapTab childId={id} />
        ) : tab === 'historique' ? (
          <HistoryTab childId={id} />
        ) : tab === 'lieux' ? (
          <PlacesTab childId={id} />
        ) : tab === 'score' ? (
          <RiskTab childId={id} />
        ) : (
          <DeviceTab childId={id} />
        )}
      </View>

      {showEmergencyButton && id && (
        <Pressable
          style={styles.emergencyBar}
          onPress={() => router.push({ pathname: '/(emergency)/urgence', params: { childId: id } })}
        >
          <Text style={styles.emergencyText}>Voir l&apos;urgence en cours →</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerInfo: { flex: 1 },
  name: { ...typography.title2, fontFamily: fontFamily.bold, color: colors.ink },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaText: { ...typography.caption, color: colors.muted },
  tabContent: { flex: 1 },
  emergencyBar: {
    backgroundColor: colors.urgence,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  emergencyText: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.white },
});
