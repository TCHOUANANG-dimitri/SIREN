import { useCallback, useState } from 'react';
import { BackHandler, Image, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AlertOctagon, Share2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Heatmap, MapView, Marker } from '@/features/tracking/map';
import { Banner, Button, Card, Skeleton } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useSearchZone } from '@/api/hooks/useSearchZone';
import { useChildren } from '@/api/hooks/useChildren';
import { usePosition } from '@/api/hooks/useTracking';
import { useShares } from '@/api/hooks/useSharing';
import { useAuthStore } from '@/stores/authStore';
import { buildMissingSheet } from '@/features/emergency/missingSheet';
import { formatClock, formatDateTime, formatRelativeTime } from '@/utils/format';

/**
 * Post-disparition — CDC App §4.4 / CDC IA-06 : carte de chaleur de la zone
 * probable, zones prioritaires, fiche partageable. Aucune publicité, aucune
 * condition de crédits.
 */
export default function PostDisappearanceScreen() {
  const { t } = useTranslation();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { data: zone, isLoading } = useSearchZone(childId, true);
  const { data: position } = usePosition(childId);
  const { data: children } = useChildren();
  const { data: shares } = useShares(childId);
  const user = useAuthStore((s) => s.user);
  const child = children?.find((c) => c.id === childId);
  const [shareError, setShareError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [])
  );

  const mobilisable = (shares ?? []).filter((s) => s.status === 'actif' && s.permissions.includes('mobilisation'));
  const lastPoint = zone?.lastPoint ?? position ?? null;

  async function shareSheet() {
    if (!child) return;
    setShareError(null);
    try {
      await Share.share({
        message: buildMissingSheet({
          t,
          child,
          zone: zone ?? null,
          lastSeenAt: lastPoint?.timestamp ?? null,
          lastPoint: lastPoint ? { lat: lastPoint.lat, lon: lastPoint.lon } : null,
          parent: user,
          formatDateTime,
        }),
      });
    } catch {
      setShareError(t('emergency.shareFailed'));
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header} accessibilityRole="header">
          <AlertOctagon size={26} color={colors.white} />
          <Text style={styles.headerTitle}>{t('emergency.postTitle')}</Text>
          <Text style={styles.headerSubtitle}>{child?.prenom}</Text>
        </View>

        <View style={styles.padded}>
          {isLoading ? (
            <Skeleton height={220} radius={16} />
          ) : !zone ? (
            <Banner kind="warning" message={t('emergency.zoneNotReady')} />
          ) : (
            <Banner
              kind="warning"
              message={t('emergency.zoneConfidenceAged', {
                confidence: zone.confidence,
                when: formatRelativeTime(zone.generatedAt),
              })}
            />
          )}
        </View>

        {lastPoint && (
          <View style={styles.mapWrapper}>
            <MapView
              style={styles.map}
              initialRegion={{ latitude: lastPoint.lat, longitude: lastPoint.lon, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
            >
              {zone && (
                <Heatmap points={zone.cells.map((c) => ({ latitude: c.lat, longitude: c.lon, weight: c.weight }))} />
              )}
              <Marker coordinate={{ latitude: lastPoint.lat, longitude: lastPoint.lon }} pinColor={colors.urgence} title={t('emergency.lastKnownPoint')} />
            </MapView>
          </View>
        )}

        <View style={styles.padded}>
          {zone && zone.topZones.length > 0 && (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>{t('emergency.priorityZones')}</Text>
              {zone.topZones.map((z) => (
                <Text key={z.rank} style={styles.zoneItem}>
                  {z.rank}. {z.label}
                </Text>
              ))}
            </Card>
          )}

          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('emergency.missingSheet')}</Text>
            <View style={styles.ficheRow}>
              {child?.photoUrl ? (
                <Image source={{ uri: child.photoUrl }} style={styles.fichePhoto} accessibilityIgnoresInvertColors />
              ) : (
                <View style={styles.fichePhotoPlaceholder}>
                  <Text style={styles.fichePhotoInitial}>{child?.prenom.charAt(0)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.ficheName}>{child?.prenom}</Text>
                <Text style={styles.ficheMeta}>{t('emergency.lastPositionAt', { time: formatClock(lastPoint?.timestamp) })}</Text>
                {zone && <Text style={styles.ficheMeta}>{t('emergency.generatedAt', { time: formatClock(zone.generatedAt) })}</Text>}
              </View>
            </View>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('emergency.circleTitle')}</Text>
            <Text style={styles.ficheMeta}>
              {mobilisable.length > 0
                ? t('emergency.circleMobilisable', { names: mobilisable.map((s) => s.nom).join(', ') })
                : t('emergency.circleEmpty')}
            </Text>
            <Text style={styles.ficheMeta}>{t('emergency.circleServerPending')}</Text>
          </Card>

          {shareError && <Banner kind="error" message={shareError} />}
          <Button label={t('emergency.shareSheet')} icon={<Share2 size={16} color={colors.white} />} onPress={shareSheet} />
          <View style={{ height: spacing.sm }} />
          <Button label={t('emergency.backToHome')} variant="secondary" onPress={() => router.replace('/(main)/(tabs)')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.disparition },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xxxl },
  header: { padding: spacing.xxl, paddingTop: spacing.xxxl, alignItems: 'center', gap: spacing.sm },
  headerTitle: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.white, textAlign: 'center' },
  headerSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)' },
  padded: { padding: spacing.lg },
  mapWrapper: { marginHorizontal: spacing.lg, borderRadius: radii.lg, overflow: 'hidden' },
  map: { height: 240 },
  card: { marginBottom: spacing.md, backgroundColor: colors.white },
  cardTitle: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.sm },
  zoneItem: { ...typography.body, color: colors.slate, marginBottom: 4 },
  ficheRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  fichePhoto: { width: 56, height: 56, borderRadius: 28 },
  fichePhotoPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  fichePhotoInitial: { ...typography.title2, fontFamily: fontFamily.bold, color: colors.primary },
  ficheName: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  ficheMeta: { ...typography.caption, color: colors.muted, marginTop: 2 },
});
