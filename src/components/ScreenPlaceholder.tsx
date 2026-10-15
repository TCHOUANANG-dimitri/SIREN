import React from 'react';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontFamily, spacing, typography, makeStyles } from '@/theme';

/** Écran temporaire — remplacé lot par lot pendant la construction de l'app. */
export function ScreenPlaceholder({ title, lot }: { title: string; lot: string }) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.lot}>{lot}</Text>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  title: { ...typography.title2, fontFamily: fontFamily.semiBold, color: colors.ink, textAlign: 'center' },
  lot: { ...typography.caption, color: colors.muted, textAlign: 'center' },
}));
