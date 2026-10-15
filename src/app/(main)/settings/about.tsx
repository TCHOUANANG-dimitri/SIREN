import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, FileText } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { SettingsRow, SettingsSection } from '@/components';
import { fontFamily, lightColors, makeStyles, radii, spacing, touchTarget, typography, useTheme } from '@/theme';
import { appBuild, appName, appVersion, technicalInfo } from '@/features/system/appInfo';

const LOGO = require('../../../../assets/images/siren-logo.png');

/**
 * À propos — uniquement des informations présentes dans le projet (CDC, configuration).
 * Contacts, liens officiels et crédits nominatifs n'existent pas encore : ils ne
 * sont pas inventés ; le contact renvoie aux mentions légales (à compléter).
 */
export default function AboutScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const version = appVersion();
  const build = appBuild();
  const tech = technicalInfo();

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

        <View style={styles.hero}>
          <View style={styles.logoBox}>
            <Image source={LOGO} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors accessible accessibilityLabel={appName()} />
          </View>
          <Text style={styles.name} accessibilityRole="header">{appName()}</Text>
          <Text style={styles.tagline}>{t('settings.about.tagline')}</Text>
        </View>

        <SettingsSection title={t('settings.about.mission')}>
          <View style={styles.textBlock}>
            <Text style={styles.paragraph}>{t('settings.about.missionBody')}</Text>
            <Text style={styles.paragraph}>{t('settings.about.howBody')}</Text>
            <Text style={styles.notice}>{t('settings.about.notASubstitute')}</Text>
          </View>
        </SettingsSection>

        <SettingsSection title={t('settings.about.versionSection')}>
          {version ? <SettingsRow label={t('settings.about.version')} value={version} /> : null}
          {build ? <SettingsRow label={t('settings.about.build')} value={build} /> : null}
          <SettingsRow label={t('settings.about.environment')} value={t(`settings.about.env.${tech.environment}`)} />
          <SettingsRow
            label={t('settings.about.dataSource')}
            value={t(tech.apiMode === 'mock' ? 'settings.about.dataDemo' : 'settings.about.dataServer')}
          />
          <SettingsRow label={t('settings.about.apiContract')} value={tech.apiContract} />
        </SettingsSection>

        <SettingsSection title={t('settings.about.team')} footer={t('settings.about.contactFooter')}>
          <View style={styles.textBlock}>
            <Text style={styles.paragraph}>{t('settings.about.teamBody')}</Text>
          </View>
          <SettingsRow
            icon={FileText}
            label={t('legal.docs.legal-notice')}
            onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'legal-notice' } })}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.about.credits')}>
          <View style={styles.textBlock}>
            <Text style={styles.paragraph}>{t('settings.about.creditsBody')}</Text>
          </View>
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  back: { width: touchTarget.min, height: touchTarget.min, justifyContent: 'center', marginLeft: -spacing.sm },
  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xxl },
  // Le logo est dessiné pour un fond clair : cartouche claire dans les deux thèmes.
  logoBox: { backgroundColor: lightColors.card, borderRadius: radii.xl, padding: spacing.md },
  logo: { width: 160, height: 72 },
  name: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink },
  tagline: { ...typography.body, color: colors.muted, textAlign: 'center' },
  textBlock: { padding: spacing.lg, gap: spacing.md },
  paragraph: { ...typography.body, color: colors.slate },
  notice: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.urgence },
}));
