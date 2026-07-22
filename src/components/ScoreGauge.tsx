import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fontFamily, riskColors, typography, type RiskColorKey } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ScoreGaugeProps {
  score: number; // 0..100
  state: RiskColorKey;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function ScoreGauge({ score, state, size = 180, strokeWidth = 14, label }: ScoreGaugeProps) {
  const anim = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = riskColors[state].fg;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.max(0, Math.min(100, score)),
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [score, anim]);

  const strokeDashoffset = anim.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}, ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.score, { color: colors.ink }]}>{Math.round(score)}</Text>
        <Text style={styles.label}>{label ?? riskColors[state].label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center' },
  score: { ...typography.display, fontFamily: fontFamily.bold },
  label: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.muted, marginTop: 2 },
});
