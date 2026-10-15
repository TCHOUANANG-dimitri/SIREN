import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { radii, shadow, spacing, makeStyles } from '@/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export function Card({ children, style, padded = true }: CardProps) {
  const styles = useStyles();
  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    ...shadow.card,
  },
  padded: { padding: spacing.lg },
}));
