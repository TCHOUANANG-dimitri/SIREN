import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MapPinned, Gauge, Layers } from 'lucide-react-native';
import { Button } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { storage } from '@/utils/storage';

const ONBOARDING_KEY = 'siren.onboarding.seen';

const slides = [
  {
    title: 'SIREN apprend les habitudes de votre enfant.',
    body: "En quelques semaines, l'IA identifie les routines pour détecter toute anomalie instantanément.",
    Icon: MapPinned,
  },
  {
    title: 'Vous êtes alerté dès qu’il sort de sa routine.',
    body: 'Un score de risque clair et des raisons explicites, pour réagir vite et sans panique.',
    Icon: Gauge,
  },
  {
    title: 'Protégé dès le premier jour, plus fin chaque semaine.',
    body: "Règles déclarées, détecteurs universels et apprentissage personnalisé se combinent en confiance croissante.",
    Icon: Layers,
  },
];

export default function OnboardingScreen() {
  const [index, setIndex] = useState(0);
  const isLast = index === slides.length - 1;
  const slide = slides[index];

  async function finish() {
    await storage.setItem(ONBOARDING_KEY, true);
    router.replace('/(auth)/login');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        {!isLast && (
          <Text style={styles.skip} onPress={finish}>
            Passer
          </Text>
        )}
      </View>
      <View style={styles.dots}>
        {slides.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
      <View style={styles.illustration}>
        <View style={styles.iconCircle}>
          <slide.Icon size={64} color={colors.primary} strokeWidth={1.5} />
        </View>
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </View>
      <View style={styles.footer}>
        <Button
          label={isLast ? 'Commencer' : 'Suivant →'}
          onPress={isLast ? finish : () => setIndex((i) => i + 1)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: { height: 44, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: spacing.xxl },
  skip: { ...typography.body, fontFamily: fontFamily.medium, color: colors.muted },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, paddingVertical: spacing.md },
  dot: { width: 7, height: 5, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: colors.primary },
  illustration: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { paddingHorizontal: spacing.xxl, marginBottom: spacing.xxl },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.sm },
  body: { ...typography.body, fontFamily: fontFamily.regular, color: colors.muted, lineHeight: 22 },
  footer: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxl },
});
