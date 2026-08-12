import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable } from 'react-native';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { useChildren } from '@/api/hooks/useChildren';
import { useUiStore } from '@/stores/uiStore';
import { MapTab } from '@/features/children/tabs/MapTab';
import { Banner } from '@/components';

export default function MapScreen() {
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
      {children && children.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherRow}>
          {children.map((child) => (
            <Pressable
              key={child.id}
              onPress={() => setSelectedChildId(child.id)}
              style={[styles.chip, child.id === activeChild?.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, child.id === activeChild?.id && styles.chipTextActive]}>
                {child.prenom}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {!activeChild ? (
        <View style={styles.empty}>
          <Banner kind="info" message="Ajoutez un enfant pour voir sa position sur la carte." />
        </View>
      ) : (
        <MapTab childId={activeChild.id} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  switcherRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceChip },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  chipTextActive: { color: colors.white },
  empty: { padding: spacing.lg },
});
