import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/theme';

/** Réutilisé par la route Splash et par le natif (image statique) — CDC1 §9.1. */
export function SplashVisual() {
  const dotAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [dotAnim]);

  const scale = dotAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });

  return (
    <View style={styles.container}>
      <Image
        source={require('../../../assets/images/image.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <View style={styles.dots}>
        <View style={styles.dot} />
        <View style={styles.dot} />
        <Animated.View style={[styles.dot, styles.dotActive, { transform: [{ scale }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 200, height: 200 },
  dots: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xxxl },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 20 },
});
