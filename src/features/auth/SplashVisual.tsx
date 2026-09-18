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
        source={require('../../../assets/images/siren-logo.png')}
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
  // Ratio 3:2 du logo détouré (1418×945) : un cadre carré laisserait
  // une bande vide au-dessus et en dessous avec resizeMode="contain".
  logo: { width: 232, height: 155 },
  dots: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xxxl },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 20 },
});
