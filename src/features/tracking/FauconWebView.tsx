import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { useTranslation } from 'react-i18next';

/**
 * Passerelle temporaire vers Faucon — la plateforme qui assure le tracking GPS
 * réel en attendant que le pipeline patch → serveur SIREN soit opérationnel.
 *
 * Aucun identifiant n'est embarqué dans l'application : le bundle JS est
 * extractible de l'APK, donc tout secret qu'on y placerait serait lisible. Le
 * parent saisit ses accès sur la page de connexion Faucon ; la session est
 * ensuite conservée par les cookies de la WebView, y compris après redémarrage.
 */

type Status = 'loading' | 'ready' | 'error';

export function FauconWebView() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const webviewRef = useRef<WebView>(null);

  const retry = useCallback(() => {
    setStatus('loading');
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        key={reloadKey}
        ref={webviewRef}
        source={{ uri: env.fauconUrl }}
        onLoadEnd={() => setStatus((s) => (s === 'error' ? s : 'ready'))}
        onError={(e) => {
          logger.error(e.nativeEvent.description, { stage: 'faucon-webview' });
          setStatus('error');
        }}
        onHttpError={(e) => {
          logger.error(`HTTP ${e.nativeEvent.statusCode}`, { stage: 'faucon-webview' });
        }}
        javaScriptEnabled
        // domStorage + cookies : sans eux la session Faucon est perdue à chaque
        // retour sur l'onglet, obligeant à se reconnecter en permanence.
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        // La carte Faucon demande la position via l'API de géolocalisation du navigateur.
        geolocationEnabled
        // Laisse le clavier accessible sur les champs du formulaire de connexion.
        keyboardDisplayRequiresUserAction={false}
        startInLoadingState={false}
        style={styles.webview}
      />

      {status === 'loading' && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.overlayText}>{t('map.fauconLoading')}</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>{t('map.fauconUnreachable')}</Text>
          <Text style={styles.errorBody}>{t('map.fauconRetryHint')}</Text>
          <Pressable onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  webview: { flex: 1, backgroundColor: colors.surface },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  overlayText: { ...typography.body, color: colors.muted },
  errorTitle: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.ink },
  errorBody: { ...typography.caption, color: colors.muted, textAlign: 'center' },
  retryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  retryText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.white },
});
