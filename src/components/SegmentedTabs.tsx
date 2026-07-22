import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, fontFamily, radii, spacing } from '@/theme';

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

const styles = StyleSheet.create({
  container: { flexGrow: 0 },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill },
  pillActive: { backgroundColor: colors.primary },
  pillInactive: { backgroundColor: '#F0EDE8' },
  label: { fontSize: 13, fontFamily: fontFamily.semiBold },
  labelActive: { color: colors.white },
  labelInactive: { color: colors.muted },
});
