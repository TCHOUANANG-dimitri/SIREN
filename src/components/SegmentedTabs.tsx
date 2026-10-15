import React from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { fontFamily, radii, spacing, typography, makeStyles } from '@/theme';

interface SegmentedTabsProps<T extends string> {
  tabs: { key: T; label: string }[];
  activeKey: T;
  onChange: (key: T) => void;
}

export function SegmentedTabs<T extends string>({
  tabs,
  activeKey,
  onChange,
}: SegmentedTabsProps<T>) {
  const styles = useStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.container}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
          >
            <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flexGrow: 0 },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  // 40 px + hitSlop de 4 px en haut et en bas : cible effective de 48 px (CDC §8).
  pill: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.pill },
  pillActive: { backgroundColor: colors.primary },
  pillInactive: { backgroundColor: colors.surfaceChip },
  label: { ...typography.caption, fontFamily: fontFamily.semiBold },
  labelActive: { color: colors.onPrimary },
  labelInactive: { color: colors.muted },
}));
