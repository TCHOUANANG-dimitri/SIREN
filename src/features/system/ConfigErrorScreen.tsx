import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { ConfigIssue } from '@/config/env';
import { colors, fontFamily, spacing, typography } from '@/theme';

/**
 * Affiché à la place de l'app quand la configuration du build est inutilisable
 * (ex. mode live sans URL HTTPS) : un message explicite plutôt qu'un crash obscur.
 */
export function ConfigErrorScreen({ issues }: { issues: readonly ConfigIssue[] }) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('config.title')}</Text>
        <Text style={styles.body}>{t('config.body')}</Text>
        {issues.map((issue) => (
          <View key={`${issue.key}-${issue.message}`} style={styles.issue}>
            <Text style={styles.issueKey}>{issue.key}</Text>
            <Text style={styles.body}>{issue.message}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title2, fontFamily: fontFamily.semiBold, color: colors.ink },
  body: { ...typography.body, color: colors.muted },
  issue: { gap: 2, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  issueKey: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.urgence },
});
