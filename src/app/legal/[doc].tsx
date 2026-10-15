import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Banner, Button } from '@/components';
import { fontFamily, makeStyles, spacing, touchTarget, typography, useTheme } from '@/theme';
import { isLegalDocumentId, legalContent, legalMeta } from '@/legal/registry';
import { formatDate } from '@/utils/format';

/**
 * Lecture d'un document juridique : texte complet (jamais tronqué), titres
 * hiérarchisés, version et dates, dans la langue de l'interface.
 */
export default function LegalDocumentScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const id = isLegalDocumentId(doc) ? doc : null;
  // Contenu statique : recalculé seulement si le document ou la langue change.
  const content = useMemo(() => (id ? legalContent(id, i18n.language) : null), [id, i18n.language]);

  const back = (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/legal'))}
      hitSlop={12}
      style={styles.back}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
    >
      <ArrowLeft size={20} color={colors.ink} />
    </Pressable>
  );

  if (!id || !content) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.content}>
          {back}
          <Banner kind="error" message={t('legal.notFound')} />
          <Button label={t('legal.title')} variant="ghost" onPress={() => router.replace('/legal')} />
        </View>
      </SafeAreaView>
    );
  }

  const meta = legalMeta(id);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {back}
        <Text style={styles.title} accessibilityRole="header">{content.title}</Text>
        <Text style={styles.meta}>
          {t('legal.meta', { version: meta.version, published: formatDate(meta.publishedAt), effective: formatDate(meta.effectiveAt) })}
        </Text>
        {meta.status === 'draft' && (
          <View style={styles.banner}>
            <Banner kind="warning" message={t('legal.draftBanner')} />
          </View>
        )}
        {content.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading} accessibilityRole="header">{section.heading}</Text>
            {section.paragraphs.map((paragraph, index) => (
              <Text key={index} style={styles.paragraph} selectable>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  back: { width: touchTarget.min, height: touchTarget.min, justifyContent: 'center', marginLeft: -spacing.sm },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  meta: { ...typography.caption, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.lg },
  banner: { marginBottom: spacing.lg },
  section: { marginBottom: spacing.xl, gap: spacing.sm },
  heading: { ...typography.title2, fontFamily: fontFamily.semiBold, color: colors.ink },
  paragraph: { ...typography.body, color: colors.slate, lineHeight: 24 },
}));
