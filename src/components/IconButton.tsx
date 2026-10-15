import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { radii, touchTarget, makeStyles } from '@/theme';

interface IconButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({ children, onPress, accessibilityLabel, style }: IconButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [styles.base, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  base: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  pressed: { opacity: 0.6 },
}));
