import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '@/stores/uiStore';
import { colors, fontFamily, typography } from '@/theme';
import { formatClock } from '@/utils/format';
import { trackEvent } from '@/utils/logger';

/** Horodatage de la dernière donnée reçue avec succès (toutes requêtes confondues). */
function useLastSyncAt(): number | null {
  const queryClient = useQueryClient();
  const [lastSync, setLastSync] = useState<number | null>(null);
  useEffect(() => {
    const compute = () => {
      const max = queryClient
        .getQueryCache()
        .getAll()
        .reduce((acc, q) => Math.max(acc, q.state.dataUpdatedAt), 0);
      setLastSync(max > 0 ? max : null);
    };
    compute();
    return queryClient.getQueryCache().subscribe(compute);
  }, [queryClient]);
  return lastSync;
}

/**
 * Bandeau hors-ligne — CDC App §6 : « Données hors-ligne, MAJ à HH:MM ».
 * S'appuie sur la connectivité réelle du téléphone et sur l'état du canal temps réel.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const deviceOnline = useUiStore((s) => s.deviceOnline);
  const status = useUiStore((s) => s.connectionStatus);
  const lastSync = useLastSyncAt();

  useEffect(() => {
    if (!deviceOnline) trackEvent('app_offline');
  }, [deviceOnline]);

  if (deviceOnline && status === 'connected') return null;

  const message = !deviceOnline || status === 'disconnected'
    ? lastSync
      ? t('offline.bannerWithTime', { time: formatClock(new Date(lastSync).toISOString()) })
      : t('offline.banner')
    : t('offline.reconnecting');

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.prealerte, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  text: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.white, textAlign: 'center' },
});
