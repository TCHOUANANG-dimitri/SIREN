import { Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, FileText } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { SettingsRow, SettingsSection } from '@/components';
import { fontFamily, makeStyles, spacing, touchTarget, typography, useTheme } from '@/theme';
import { LEGAL_DOCUMENTS, legalContent } from '@/legal/registry';
import { formatDate } from '@/utils/format';

/** Liste des documents juridiques — accessible connecté ou non (inscription, réglages). */
export default function LegalIndexScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">{t('legal.title')}</Text>
        <Text style={styles.subtitle}>{t('legal.listSubtitle')}</Text>

        <SettingsSection footer={t('legal.draftFooter')}>
          {LEGAL_DOCUMENTS.map((meta) => {
            const content = legalContent(meta.id, i18n.language);
            return (
              <SettingsRow
                key={meta.id}
                icon={FileText}
                label={content.title}
                description={`${content.summary} ${t('legal.versionShort', { date: formatDate(meta.effectiveAt) })}`}
                onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: meta.id } })}
              />
            );
          })}
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  back: { width: touchTarget.min, height: touchTarget.min, justifyContent: 'center', marginLeft: -spacing.sm },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  subtitle: { ...typography.body, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.xl },
}));
