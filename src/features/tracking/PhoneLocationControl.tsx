import { Linking, Platform, Text, View } from 'react-native';
import { LocateFixed } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { fontFamily, radii, shadow, spacing, typography, makeStyles, useTheme } from '@/theme';
import { useLocationStore } from '@/stores/locationStore';
import { formatRelativeTime } from '@/utils/format';
import { isPhoneFixStale } from './phoneLocation';

/** Ouvre les réglages adaptés (localisation du téléphone, sinon réglages de l'app). */
export async function openLocationSettings(servicesOff: boolean) {
  if (servicesOff && Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
      return;
    } catch {
      // repli sur les réglages de l'application
    }
  }
  await Linking.openSettings();
}

/**
 * Commande « Ma position » de la carte : la position du TÉLÉPHONE n'est relevée
 * qu'après une action explicite. Chaque état est expliqué (refus, refus définitif,
 * localisation désactivée, relevé impossible) ; aucune position n'est inventée.
 */
export function PhoneLocationControl() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { permission, fix, error, request, refresh } = useLocationStore();

  if (permission === 'blocked' || permission === 'services_off') {
    const servicesOff = permission === 'services_off';
    return (
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.text}>{t(servicesOff ? 'tracking.phone.servicesOff' : 'tracking.phone.blocked')}</Text>
        <View style={styles.row}>
          <Button
            label={t('tracking.phone.openSettings')}
            variant="secondary"
            fullWidth={false}
            onPress={() => void openLocationSettings(servicesOff)}
          />
          <Button label={t('tracking.phone.retry')} variant="ghost" fullWidth={false} onPress={() => void refresh()} />
        </View>
      </View>
    );
  }

  if (permission === 'granted' && fix) {
    const stale = isPhoneFixStale(fix.timestamp);
    return (
      <View style={styles.card}>
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <Text style={styles.text}>
            {stale ? t('tracking.phone.stale', { when: formatRelativeTime(new Date(fix.timestamp).toISOString()) }) : t('tracking.phone.shown')}
          </Text>
        </View>
        {(stale || error) && (
          <Button label={t('tracking.phone.update')} variant="ghost" fullWidth={false} onPress={() => void refresh()} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {permission === 'denied' && <Text style={styles.text}>{t('tracking.phone.denied')}</Text>}
      {permission === 'granted' && error && <Text style={styles.text}>{t('tracking.phone.unavailable')}</Text>}
      <Button
        label={t('tracking.phone.show')}
        variant="secondary"
        icon={<LocateFixed size={16} color={colors.accent} />}
        onPress={() => void request()}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm, ...shadow.card },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.onPrimary },
  text: { ...typography.caption, fontFamily: fontFamily.medium, color: colors.ink, flexShrink: 1 },
}));
