import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useChildren } from '@/api/hooks/useChildren';
import { useUiStore } from '@/stores/uiStore';
import { MapTab } from '@/features/children/tabs/MapTab';
import { FauconWebView } from '@/features/tracking/FauconWebView';
import { Banner } from '@/components';
import { useTranslation } from 'react-i18next';

/**
 * Deux sources de position cohabitent le temps de la transition :
 * - `faucon` : tracking GPS réel, servi par la plateforme Faucon dans une WebView.
 * - `demo`   : carte SIREN alimentée par le backend simulé.
 * À retirer une fois le pipeline patch → serveur SIREN opérationnel.
 */
type Source = 'faucon' | 'demo';

const SOURCES: { key: Source; label: string }[] = [
  { key: 'faucon', label: 'GPS réel' },
  { key: 'demo', label: 'Démo SIREN' },
];

export default function MapScreen() {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>('faucon');
  const { data: children } = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);

  useEffect(() => {
    if (!selectedChildId && children && children.length > 0) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId, setSelectedChildId]);

  const activeChild = children?.find((c) => c.id === selectedChildId) ?? children?.[0];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.sourceRow}>
        {SOURCES.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => setSource(key)}
            style={[styles.sourceChip, key === source && styles.sourceChipActive]}
          >
            <Text style={[styles.sourceText, key === source && styles.sourceTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {source === 'faucon' ? (
        <FauconWebView />
      ) : (
        <>
          {children && children.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.switcherRow}
            >
              {children.map((child) => (
                <Pressable
                  key={child.id}
                  onPress={() => setSelectedChildId(child.id)}
                  style={[styles.chip, child.id === activeChild?.id && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, child.id === activeChild?.id && styles.chipTextActive]}
                  >
                    {child.prenom}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {!activeChild ? (
            <View style={styles.empty}>
              <Banner kind="info" message={t('map.noChild')} />
            </View>
          ) : (
            <MapTab childId={activeChild.id} />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  sourceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sourceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sourceText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  sourceTextActive: { color: colors.white },
  switcherRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceChip,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  chipTextActive: { color: colors.white },
  empty: { padding: spacing.lg },
});
