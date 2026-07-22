import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BatteryMedium, Wifi, WifiOff } from 'lucide-react-native';
import { Card, StateBadge } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useChildStatus } from '@/api/hooks/useChildren';
import { useRisk } from '@/api/hooks/useRisk';
import type { Child } from '@/models/entities';
import { formatRelativeTime } from '@/utils/format';

export function ChildCard({ child }: { child: Child }) {
  const { data: status } = useChildStatus(child.id);
  const { data: risk } = useRisk(child.id);

  return (
    <Pressable onPress={() => router.push(`/(main)/children/${child.id}`)}>
      <Card style={styles.card}>
        <View style={styles.row}>
          {child.photoUrl ? (
            <Image source={{ uri: child.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{child.prenom.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.infoCol}>
            <Text style={styles.name}>{child.prenom}</Text>
            {risk && <StateBadge state={risk.state} compact />}
          </View>
          {risk && <Text style={styles.score}>{risk.score}</Text>}
        </View>

        <View style={styles.metaRow}>
          {status && (
            <View style={styles.metaItem}>
              <BatteryMedium size={14} color={status.battery < 20 ? colors.urgence : colors.muted} />
              <Text style={styles.metaText}>{status.battery}%</Text>
            </View>
          )}
          {status && (
            <View style={styles.metaItem}>
              {status.online ? <Wifi size={14} color={colors.veille} /> : <WifiOff size={14} color={colors.urgence} />}
              <Text style={styles.metaText}>{status.online ? 'En ligne' : 'Hors ligne'}</Text>
            </View>
          )}
          {risk && <Text style={styles.metaText}>{formatRelativeTime(risk.timestamp)}</Text>}
        </View>

        {child.modelConfidence < 90 && (
          <View style={styles.confidenceRow}>
            <View style={styles.confidenceTrack}>
              <View style={[styles.confidenceFill, { width: `${child.modelConfidence}%` }]} />
            </View>
            <Text style={styles.confidenceText}>Confiance IA {Math.round(child.modelConfidence)}%</Text>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { ...typography.title2, fontFamily: fontFamily.bold, color: colors.primary },
  infoCol: { flex: 1, gap: 4 },
  name: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  score: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  metaRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.caption, color: colors.muted },
  confidenceRow: { marginTop: spacing.md, gap: 4 },
  confidenceTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  confidenceFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  confidenceText: { ...typography.caption, color: colors.muted },
});
