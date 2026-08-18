import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Info } from 'lucide-react-native';
import { Card, ScoreGauge, Skeleton } from '@/components';
import { colors, fontFamily, radii, riskColors, spacing, typography } from '@/theme';
import { useRisk, useRiskHistory } from '@/api/hooks/useRisk';

const subScoreLabels: Record<string, string> = {
  geo: 'Géographique',
  mouvement: 'Mouvement',
  universel: 'Détecteurs universels',
  declaratif: 'Règles déclarées',
};

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 300;
  const height = 60;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - (v / 100) * height}`)
    .join(' ');
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline points={points} fill="none" stroke={colors.primary} strokeWidth={2} />
    </Svg>
  );
}

export function RiskTab({ childId }: { childId: string }) {
  const { data: risk, isLoading } = useRisk(childId);
  const { data: history } = useRiskHistory(childId);

  if (isLoading || !risk) {
    return (
      <View style={styles.padded}>
        <Skeleton height={200} radius={100} />
      </View>
    );
  }

  const subScoreEntries = Object.entries(risk.subScores) as [keyof typeof risk.subScores, number][];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.gaugeWrap}>
        <ScoreGauge score={risk.score} state={risk.state} size={200} />
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Raisons</Text>
        {risk.reasons.map((reason) => (
          <View key={reason} style={styles.reasonRow}>
            <Info size={14} color={colors.muted} />
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ))}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Décomposition par sous-score</Text>
        {subScoreEntries.map(([key, value]) => (
          <View key={key} style={styles.subScoreRow}>
            <Text style={styles.subScoreLabel}>{subScoreLabels[key]}</Text>
            <View style={styles.subScoreTrack}>
              <View
                style={[
                  styles.subScoreFill,
                  { width: `${Math.round(value * 100)}%`, backgroundColor: riskColors[risk.state].fg },
                ]}
              />
            </View>
          </View>
        ))}
      </Card>

      <Card style={styles.card}>
        <View style={styles.confidenceHeader}>
          <Text style={styles.cardTitle}>Confiance du modèle</Text>
          <Text style={styles.confidenceValue}>{Math.round(risk.confidence)}%</Text>
        </View>
        <View style={styles.subScoreTrack}>
          <View style={[styles.subScoreFill, { width: `${risk.confidence}%`, backgroundColor: colors.primary }]} />
        </View>
        <Text style={styles.confidenceHint}>
          {risk.confidence < 70
            ? "La couche personnalisée est encore en apprentissage — la confiance progresse avec l'usage quotidien."
            : 'La routine de cet enfant est bien connue du modèle.'}
        </Text>
      </Card>

      {history && history.length > 1 && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Évolution récente</Text>
          <Sparkline values={history.map((h) => h.score)} />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  padded: { padding: spacing.xl },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  gaugeWrap: { alignItems: 'center', marginVertical: spacing.xl },
  card: { marginBottom: spacing.md },
  cardTitle: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.sm },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  reasonText: { ...typography.body, color: colors.slate },
  subScoreRow: { marginBottom: spacing.sm },
  subScoreLabel: { ...typography.caption, color: colors.muted, marginBottom: spacing.xs },
  subScoreTrack: { height: 8, borderRadius: radii.sm, backgroundColor: colors.border, overflow: 'hidden' },
  subScoreFill: { height: 8, borderRadius: radii.sm },
  confidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  confidenceValue: { ...typography.bodyStrong, fontFamily: fontFamily.bold, color: colors.primary },
  confidenceHint: { ...typography.caption, color: colors.muted, marginTop: spacing.sm },
});
