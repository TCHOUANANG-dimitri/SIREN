import { useEffect } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import MapView, { Marker } from 'react-native-maps';
import { Ear, Phone, PhoneCall, Siren } from 'lucide-react-native';
import { Banner, Button } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { usePosition } from '@/api/hooks/useTracking';
import { useRisk } from '@/api/hooks/useRisk';
import { useChildren } from '@/api/hooks/useChildren';
import { useEmergencyContacts } from '@/api/hooks/useEmergencyContacts';
import { useRealtimeChannel } from '@/api/hooks/useRealtimeChannel';
import { useTriggerDisappearance } from '@/api/hooks/useSearchZone';
import { bearingToCardinal } from '@/utils/geo';
import { formatRelativeTime, formatSpeedKmh } from '@/utils/format';

export default function EmergencyScreen() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  useRealtimeChannel(childId);
  const { data: position } = usePosition(childId);
  const { data: risk } = useRisk(childId);
  const { data: children } = useChildren();
  const { data: contacts } = useEmergencyContacts(childId);
  const triggerDisappearance = useTriggerDisappearance(childId);
  const child = children?.find((c) => c.id === childId);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, []);

  const signalLost = position?.fixQuality === 'perdu';

  async function confirmDisappearance() {
    await triggerDisappearance.mutateAsync();
    router.replace({ pathname: '/(emergency)/post-disparition', params: { childId: childId ?? '' } });
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Siren size={28} color={colors.white} />
          <Text style={styles.headerTitle}>Urgence — {child?.prenom}</Text>
          <Text style={styles.headerSubtitle}>{risk?.reasons.join(' · ')}</Text>
        </View>

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

        {signalLost ? (
          <Banner kind="error" message={`Signal perdu depuis ${formatRelativeTime(position!.timestamp)}. Dernier point connu affiché.`} />
        ) : (
          position && (
            <Banner
              kind="warning"
              message={`En mouvement vers le ${bearingToCardinal(position.heading ?? 0)} à ${formatSpeedKmh(position.speedKmh)}`}
            />
          )
        )}

        <View style={styles.actions}>
          {contacts && contacts.length > 0 && (
            <Button
              label={`Appeler ${contacts[0].nom}`}
              icon={<Phone size={18} color={colors.white} />}
              variant="emergency"
              onPress={() => Linking.openURL(`tel:${contacts[0].telephone}`)}
            />
          )}
          <Button
            label="Appeler les secours (117)"
            icon={<PhoneCall size={18} color={colors.white} />}
            variant="emergency"
            onPress={() => Linking.openURL('tel:117')}
          />
          <Button
            label="Écoute audio encadrée"
            icon={<Ear size={18} color={colors.primary} />}
            variant="secondary"
            onPress={() => router.push({ pathname: '/(emergency)/ecoute-audio', params: { childId: childId ?? '' } })}
          />
          <Button
            label="Confirmer la disparition"
            variant="secondary"
            onPress={confirmDisappearance}
            loading={triggerDisappearance.isPending}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.urgence },
  content: { paddingBottom: spacing.xxxl },
  header: { padding: spacing.xxl, paddingTop: spacing.xxxl, alignItems: 'center', gap: spacing.sm },
  headerTitle: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.white },
  headerSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  mapWrapper: { marginHorizontal: spacing.xl, borderRadius: 16, overflow: 'hidden', marginBottom: spacing.lg },
  map: { height: 220 },
  actions: { padding: spacing.xl, gap: spacing.md },
});
