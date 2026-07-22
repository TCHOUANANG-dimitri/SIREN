import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { mockEventBus, type BusEvent } from '@/api/mock/mockEventBus';
import { useUiStore } from '@/stores/uiStore';
import { colors, fontFamily, spacing, typography } from '@/theme';

/**
 * Bandeau hors-ligne — CDC1 §12. Reflète le canal temps réel simulé (mockEventBus) : il n'y a
 * pas de vraie connexion réseau à surveiller ici, seulement le cycle de vie du canal démo.
 */
export function OfflineBanner() {
  const status = useUiStore((s) => s.connectionStatus);
  const setStatus = useUiStore((s) => s.setConnectionStatus);

  useEffect(() => {
    const unsubscribe = mockEventBus.subscribe((event: BusEvent) => {
      if (event.type === 'connection') setStatus(event.status);
    });
    return unsubscribe;
  }, [setStatus]);

  if (status === 'connected') return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {status === 'reconnecting'
          ? 'Reconnexion en cours…'
          : `Données hors-ligne, dernière mise à jour à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.prealerte, paddingVertical: 6, alignItems: 'center' },
  text: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.white },
});
