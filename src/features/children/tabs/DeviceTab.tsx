import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { RefreshCw } from 'lucide-react-native';
import { Banner, Button, Card, Skeleton } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useDeviceSettings, usePatchDeviceSettings } from '@/api/hooks/useDevice';
import { useChildStatus } from '@/api/hooks/useChildren';
import { useCurrentAccess } from '@/features/sharing/useCurrentAccess';
import { toUserMessage } from '@/api/errors';
import { formatBattery, formatRelativeTime } from '@/utils/format';
import type { EnergyMode } from '@/models/entities';
import { useTranslation } from 'react-i18next';

// L'autonomie par mode dépend du matériel (CDC Dispositif §3, non chiffré) : aucune durée n'est affichée.
const ENERGY_MODES: EnergyMode[] = ['continu', 'equilibre', 'economie'];

/**
 * Réglages du dispositif. L'app écrit la configuration souhaitée sur le
 * serveur, qui incrémente `configVersion` ; le dispositif la récupère à sa
 * prochaine connexion (GET /device/v1/pack). L'app ne contacte jamais le boîtier.
 */
export function DeviceTab({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const { data: settings, isLoading, isError, refetch } = useDeviceSettings(childId);
  const status = useChildStatus(childId);
  const patch = usePatchDeviceSettings(childId);
  const { can } = useCurrentAccess(childId);
  const canConfigure = can('configure_device');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <View style={styles.content}><Skeleton height={200} radius={16} /><Skeleton height={120} radius={16} style={{ marginTop: spacing.md }} /></View>;
  if (isError || !settings) return <View style={styles.content}><Banner kind="error" message={t('childTabs.deviceLoadError')} /></View>;

  async function apply(next: { energyMode?: EnergyMode; sensitivity?: number }) {
    setError(null);
    try {
      await patch.mutateAsync(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  const device = status.data;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {saved && <Banner kind="success" message={t('childTabs.settingsSentToServer')} />}
      {error && <Banner kind="error" message={error} />}
      {!canConfigure && <Banner kind="info" message={t('childTabs.principalOnlySettings')} />}

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('childTabs.powerMode')}</Text>
        {settings.energyMode === null && <Text style={styles.hint}>{t('childTabs.energyModeUnknown')}</Text>}
        {ENERGY_MODES.map((mode) => (
          <Pressable
            key={mode}
            style={[styles.modeRow, settings.energyMode === mode && styles.modeRowActive]}
            onPress={() => apply({ energyMode: mode })}
            disabled={!canConfigure || patch.isPending}
            accessibilityRole="radio"
            accessibilityState={{ checked: settings.energyMode === mode, disabled: !canConfigure }}
          >
            <View style={[styles.radio, settings.energyMode === mode && styles.radioActive]} />
            <Text style={styles.modeLabel}>{t(`childTabs.energy.${mode}`)}</Text>
            <Text style={styles.modeAutonomy}>{t(`childTabs.energyHint.${mode}`)}</Text>
          </Pressable>
        ))}
      </Card>

      <Card style={styles.card}>
        <View style={styles.sensitivityHeader}>
          <Text style={styles.cardTitle}>{t('childTabs.alertSensitivity')}</Text>
          <Text style={styles.sensitivityValue}>{settings.sensitivity ?? '—'}</Text>
        </View>
        <Slider
          minimumValue={0}
          maximumValue={100}
          step={5}
          value={settings.sensitivity ?? 50}
          disabled={!canConfigure}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
          onSlidingComplete={(value) => apply({ sensitivity: Math.round(value) })}
          accessibilityLabel={t('childTabs.alertSensitivity')}
        />
        <View style={styles.sliderBounds}>
          <Text style={styles.sliderBoundText}>{t('childTabs.cautious')}</Text>
          <Text style={styles.sliderBoundText}>{t('childTabs.tolerant')}</Text>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('childTabs.information')}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>{t('childTabs.settingsVersion')}</Text>
          <Text style={styles.infoValue}>v{settings.configVersion}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>{t('childTabs.firmware')}</Text>
          <Text style={styles.infoValue}>{device?.firmwareVersion ?? '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>{t('childTabs.battery')}</Text>
          <Text style={styles.infoValue}>{formatBattery(device?.battery)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoKey}>{t('childTabs.lastSeen')}</Text>
          <Text style={styles.infoValue}>{formatRelativeTime(device?.lastSeen)}</Text>
        </View>
        <Text style={styles.hint}>{t('childTabs.syncExplanation')}</Text>
      </Card>

      <Button
        label={t('childTabs.refreshDeviceState')}
        variant="secondary"
        icon={<RefreshCw size={16} color={colors.primary} />}
        onPress={() => {
          void refetch();
          void status.refetch();
        }}
        loading={status.isRefetching}
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
  hint: { ...typography.caption, color: colors.muted, marginTop: spacing.xs },
  sensitivityValue: { ...typography.bodyStrong, fontFamily: fontFamily.bold, color: colors.primary },
  sliderBounds: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderBoundText: { ...typography.caption, color: colors.muted },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  infoKey: { ...typography.body, color: colors.slate },
  infoValue: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
});
