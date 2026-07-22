import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { RefreshCw } from 'lucide-react-native';
import { Banner, Button, Card } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useDeviceSettings, usePatchDeviceSettings } from '@/api/hooks/useDevice';
import { formatRelativeTime } from '@/utils/format';
import type { DeviceStatus } from '@/models/entities';

const ENERGY_MODES: { key: DeviceStatus['energyMode']; label: string; autonomy: string }[] = [
  { key: 'continu', label: 'Continu', autonomy: '~18 h' },
  { key: 'equilibre', label: 'Équilibré', autonomy: '~3 jours' },
  { key: 'economie', label: 'Économie', autonomy: '~7 jours' },
];

export function DeviceTab({ childId }: { childId: string }) {
  const { data: device, isLoading } = useDeviceSettings(childId);
  const patch = usePatchDeviceSettings(childId);
  const [saved, setSaved] = useState(false);

  if (isLoading || !device) return null;

  async function setEnergyMode(mode: DeviceStatus['energyMode']) {
    await patch.mutateAsync({ energyMode: mode });
    flashSaved();
  }

  async function setSensitivity(value: number) {
    await patch.mutateAsync({ sensitivity: Math.round(value) });
    flashSaved();
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {saved && <Banner kind="success" message="Réglages enregistrés" />}

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Mode d'énergie</Text>
        {ENERGY_MODES.map((mode) => (
          <Pressable
            key={mode.key}
            style={[styles.modeRow, device.energyMode === mode.key && styles.modeRowActive]}
            onPress={() => setEnergyMode(mode.key)}
          >
            <View style={[styles.radio, device.energyMode === mode.key && styles.radioActive]} />
            <Text style={styles.modeLabel}>{mode.label}</Text>
            <Text style={styles.modeAutonomy}>{mode.autonomy}</Text>
          </Pressable>
        ))}
      </Card>

      <Card style={styles.card}>
        <View style={styles.sensitivityHeader}>
          <Text style={styles.cardTitle}>Sensibilité des alertes</Text>
          <Text style={styles.sensitivityValue}>{device.sensitivity}</Text>
        </View>
        <Slider
          minimumValue={0}
          maximumValue={100}
          step={5}
          value={device.sensitivity}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
          onSlidingComplete={setSensitivity}
        />
        <View style={styles.sliderBounds}>
          <Text style={styles.sliderBoundText}>Prudent</Text>
          <Text style={styles.sliderBoundText}>Tolérant</Text>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Informations</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Version des paramètres</Text>
          <Text style={styles.infoValue}>v{device.configVersion}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Firmware</Text>
          <Text style={styles.infoValue}>{device.firmwareVersion}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>Dernière synchronisation</Text>
          <Text style={styles.infoValue}>{formatRelativeTime(device.lastSeen)}</Text>
        </View>
      </Card>

      <Button
        label="Forcer une synchronisation"
        variant="secondary"
        icon={<RefreshCw size={16} color={colors.primary} />}
        onPress={() => setEnergyMode(device.energyMode)}
        loading={patch.isPending}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  card: { marginBottom: spacing.md },
  cardTitle: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.md },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  modeRowActive: {},
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  modeLabel: { ...typography.body, fontFamily: fontFamily.medium, color: colors.ink, flex: 1 },
  modeAutonomy: { ...typography.caption, color: colors.muted },
  sensitivityHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  sensitivityValue: { ...typography.bodyStrong, fontFamily: fontFamily.bold, color: colors.primary },
  sliderBounds: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderBoundText: { ...typography.caption, color: colors.muted },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  infoKey: { ...typography.body, color: colors.slate },
  infoValue: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
});
