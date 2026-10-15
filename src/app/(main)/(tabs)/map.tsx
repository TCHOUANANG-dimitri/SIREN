import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { makeStyles, spacing } from '@/theme';
import { MapTab } from '@/features/children/tabs/MapTab';
import { ChildSelector } from '@/features/children/ChildSelector';
import { useSelectedChild } from '@/features/children/useSelectedChild';
import { FauconWebView } from '@/features/tracking/FauconWebView';
import { Banner, SegmentedTabs, Skeleton } from '@/components';
import { featureFlags } from '@/config/env';
import { isMockMode } from '@/api/network';

/**
 * Deux sources de position cohabitent le temps de la transition :
 * - `faucon` : tracking GPS réel, servi par la plateforme Faucon dans une WebView.
 * - `siren`  : carte SIREN (backend simulé en mode mock, serveur en mode live).
 * À retirer une fois le pipeline patch → serveur SIREN opérationnel.
 */
type Source = 'faucon' | 'siren';

export default function MapScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>(featureFlags.faucon ? 'faucon' : 'siren');
  const { children, activeChild, isLoading, select } = useSelectedChild();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {featureFlags.faucon && (
        <SegmentedTabs<Source>
          tabs={[
            { key: 'faucon', label: t('map.sourceFaucon') },
            { key: 'siren', label: t(isMockMode() ? 'map.sourceDemo' : 'map.sourceSiren') },
          ]}
          activeKey={source}
          onChange={setSource}
        />
      )}

      {featureFlags.faucon && source === 'faucon' ? (
        <FauconWebView />
      ) : (
        <>
          <ChildSelector
            childrenList={children ?? []}
            activeId={activeChild?.id}
            onSelect={select}
            contextLabel={t('tabs.map')}
          />
          {isLoading ? (
            <View style={styles.empty}>
              <Skeleton height={48} />
            </View>
          ) : !activeChild ? (
            <View style={styles.empty}>
              <Banner kind="info" message={t('map.noChild')} />
            </View>
          ) : (
            // key : la carte repart d'un état propre (cadrage, fiche) quand l'enfant change.
            <MapTab key={activeChild.id} childId={activeChild.id} />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  empty: { padding: spacing.lg },
}));
