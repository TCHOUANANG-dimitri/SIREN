import { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, BackHandler, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MapView, Marker } from '@/features/tracking/map';
import { Ear, Phone, PhoneCall, Siren } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { usePosition } from '@/api/hooks/useTracking';
import { useRisk } from '@/api/hooks/useRisk';
import { useChildren } from '@/api/hooks/useChildren';
import { useEmergencyContacts } from '@/api/hooks/useEmergencyContacts';
import { useTriggerDisappearance } from '@/api/hooks/useSearchZone';
import { useCurrentAccess } from '@/features/sharing/useCurrentAccess';
import { useUiStore } from '@/stores/uiStore';
import { featureFlags } from '@/config/env';
import { EMERGENCY_NUMBERS } from '@/config/business';
import { toUserMessage } from '@/api/errors';
import { bearingToCardinal } from '@/utils/geo';
import { formatRelativeTime, formatSpeedKmh } from '@/utils/format';
import { trackEvent } from '@/utils/logger';

/**
 * Écran d'urgence plein écran — CDC App §4.4.
 * Non fermable par le bouton retour : la sortie est une action explicite.
 * Ne dépend ni des crédits ni de la publicité (CDC App §3, §13).
 */
export default function EmergencyScreen() {
  const { t } = useTranslation();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { data: position } = usePosition(childId);
  const { data: risk } = useRisk(childId);
  const { data: children } = useChildren();
  const { data: contacts } = useEmergencyContacts(childId);
  const triggerDisappearance = useTriggerDisappearance(childId);
  const { can } = useCurrentAccess(childId);
  const deviceOnline = useUiStore((s) => s.deviceOnline);
  const [actionError, setActionError] = useState<string | null>(null);
  const child = children?.find((c) => c.id === childId);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, []);

  // Bouton retour Android neutralisé tant que l'écran est affiché.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [])
  );

  const signalLost = position?.fixQuality === 'perdu';

  function call(number: string) {
    Linking.openURL(`tel:${number.replace(/[^\d+]/g, '')}`).catch(() => setActionError(t('emergency.callFailed')));
  }

  function confirmDisappearance() {
    RNAlert.alert(t('emergency.confirmDisappearanceTitle'), t('emergency.confirmDisappearanceBody', { child: child?.prenom ?? '' }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('emergency.confirmDisappearance'),
        style: 'destructive',
        onPress: async () => {
          setActionError(null);
          try {
            await triggerDisappearance.mutateAsync();
            trackEvent('emergency_confirmed');
            router.replace({ pathname: '/(emergency)/post-disparition', params: { childId: childId ?? '' } });
          } catch (error) {
            setActionError(toUserMessage(error));
          }
        },
      },
    ]);
  }

  function leave() {
    RNAlert.alert(t('emergency.leaveTitle'), t('emergency.leaveBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('emergency.leaveConfirm'), onPress: () => router.replace('/(main)/(tabs)') },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header} accessibilityRole="header">
          <Siren size={28} color={colors.white} />
          <Text style={styles.headerTitle}>{t('emergency.title', { child: child?.prenom ?? '' })}</Text>
          {!!risk?.reasons.length && <Text style={styles.headerSubtitle}>{risk.reasons.join(' · ')}</Text>}
        </View>

        {!deviceOnline && <Banner kind="warning" message={t('emergency.offline')} />}

        {position && (
          <View style={styles.mapWrapper}>
            <MapView
              style={styles.map}
              initialRegion={{ latitude: position.lat, longitude: position.lon, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
            >
              <Marker coordinate={{ latitude: position.lat, longitude: position.lon }} pinColor={colors.urgence} />
            </MapView>
          </View>
        )}

        {position &&
          (signalLost ? (
            <Banner kind="error" message={t('emergency.signalLost', { when: formatRelativeTime(position.timestamp) })} />
          ) : (
            <Banner
              kind="warning"
              message={
                position.heading != null && position.speedKmh != null
                  ? t('emergency.moving', { direction: bearingToCardinal(position.heading), speed: formatSpeedKmh(position.speedKmh) })
                  : t('emergency.lastPoint', { when: formatRelativeTime(position.timestamp) })
              }
            />
          ))}

        {actionError && <Banner kind="error" message={actionError} />}

        <View style={styles.actions}>
          {(contacts ?? []).map((contact) => (
            <Button
              key={contact.id}
              label={t('emergency.callContact', { name: contact.nom })}
              icon={<Phone size={18} color={colors.white} />}
              variant="emergency"
              onPress={() => call(contact.telephone)}
              accessibilityHint={contact.telephone}
            />
          ))}
          <Button
            label={t('emergency.callHelp', { number: EMERGENCY_NUMBERS.police })}
            icon={<PhoneCall size={18} color={colors.white} />}
            variant="emergency"
            onPress={() => call(EMERGENCY_NUMBERS.police)}
          />
          {featureFlags.audio && can('access_audio') && (
            <Button
              label={t('emergency.audioListening')}
              icon={<Ear size={18} color={colors.primary} />}
              variant="secondary"
              onPress={() => router.push({ pathname: '/(emergency)/ecoute-audio', params: { childId: childId ?? '' } })}
            />
          )}
          {can('trigger_disappearance_mobilisation') && (
            <Button
              label={t('emergency.confirmDisappearance')}
              variant="secondary"
              onPress={confirmDisappearance}
              loading={triggerDisappearance.isPending}
              disabled={!deviceOnline}
            />
          )}
          <Button label={t("emergency.leave")} variant="secondary" onPress={leave} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.urgence },
  content: { paddingBottom: spacing.xxxl, gap: spacing.sm },
  header: { padding: spacing.xxl, paddingTop: spacing.xxxl, alignItems: 'center', gap: spacing.sm },
  headerTitle: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.white, textAlign: 'center' },
  headerSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  mapWrapper: { marginHorizontal: spacing.xl, borderRadius: radii.lg, overflow: 'hidden', marginBottom: spacing.lg },
  map: { height: 220 },
  actions: { padding: spacing.xl, gap: spacing.md },
});
