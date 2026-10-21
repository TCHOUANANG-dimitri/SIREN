import { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, BackHandler, Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MapView, Marker } from '@/features/tracking/map';
import { Ear, Phone, PhoneCall, Siren } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button } from '@/components';
import { fontFamily, radii, spacing, typography, makeStyles, useTheme } from '@/theme';
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
import { useGeofences } from '@/api/hooks/useGeofences';
import { reasonLabel, zoneNamesOf } from '@/features/risk/reasons';

/**
 * Écran d'urgence plein écran — CDC App §4.4.
 * Non fermable par le bouton retour : la sortie est une action explicite.
 * Ne dépend ni des crédits ni de la publicité (CDC App §3, §13).
 *
 * Mise en page : les appels (secours + premier proche) sont dans une barre FIXE
 * en bas, hors du défilement, au-dessus de la zone de sécurité : ils restent
 * visibles quelle que soit la taille de l'écran ou de la police. La carte n'est
 * pas manipulable ici (elle ne capture pas le défilement de la page).
 */
export default function EmergencyScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
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
  const { data: geofences } = useGeofences(childId);
  const zoneNames = zoneNamesOf(geofences);
  const [firstContact, ...otherContacts] = contacts ?? [];

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
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="emergency-scroll">
        <View style={styles.header} accessibilityRole="header" accessibilityLiveRegion="assertive">
          <Siren size={28} color={colors.onPrimary} />
          <Text style={styles.headerTitle}>{t('emergency.title', { child: child?.prenom ?? '' })}</Text>
          {!!risk?.reasons.length && (
            <Text style={styles.headerSubtitle}>{risk.reasons.map((r) => reasonLabel(t, r, { zoneNames })).join(' · ')}</Text>
          )}
        </View>

        <View style={styles.section}>
          {!deviceOnline && <Banner kind="warning" message={t('emergency.offline')} />}

          {position && (
            // Carte en consultation seule : ni glisser ni zoomer, le doigt fait défiler la page.
            <View testID="emergency-map" style={styles.mapWrapper} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <MapView
                style={styles.map}
                scrollEnabled={false}
                zoomEnabled={false}
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
        </View>

        <View style={styles.actions}>
          {otherContacts.map((contact) => (
            <Button
              key={contact.id}
              label={t('emergency.callContact', { name: contact.nom })}
              icon={<Phone size={18} color={colors.onPrimary} />}
              variant="emergency"
              onPress={() => call(contact.telephone)}
              accessibilityHint={contact.telephone}
            />
          ))}
          {featureFlags.audio && can('access_audio') && (
            <Button
              label={t('emergency.audioListening')}
              icon={<Ear size={18} color={colors.accent} />}
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
          <Button label={t('emergency.leave')} variant="secondary" onPress={leave} />
        </View>
      </ScrollView>

      {/* Actions vitales : toujours visibles, jamais recouvertes par le contenu. */}
      <View style={styles.stickyActions} testID="emergency-sticky-actions">
        <Button
          testID="emergency-call-help"
          label={t('emergency.callHelp', { number: EMERGENCY_NUMBERS.police })}
          icon={<PhoneCall size={18} color={colors.onPrimary} />}
          variant="emergency"
          onPress={() => call(EMERGENCY_NUMBERS.police)}
        />
        {firstContact && (
          <Button
            testID="emergency-call-contact"
            label={t('emergency.callContact', { name: firstContact.nom })}
            icon={<Phone size={18} color={colors.onPrimary} />}
            variant="emergency"
            onPress={() => call(firstContact.telephone)}
            accessibilityHint={firstContact.telephone}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.urgenceFill },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xl, gap: spacing.sm },
  header: { padding: spacing.xl, paddingTop: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  headerTitle: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.onPrimary, textAlign: 'center' },
  headerSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  // Marges latérales : les bandeaux ne touchent plus les bords de l'écran.
  section: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  mapWrapper: { borderRadius: radii.lg, overflow: 'hidden', marginBottom: spacing.sm },
  map: { height: 200 },
  actions: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  stickyActions: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.urgenceFill,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
}));
