import { useEffect, useState } from 'react';
import { Alert as RNAlert, KeyboardAvoidingView, Linking, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BellRing,
  FileText,
  Fingerprint,
  Info,
  KeyRound,
  LogOut,
  RotateCcw,
  Smartphone,
  Trash2,
  Users,
  Baby,
  WifiOff,
} from 'lucide-react-native';
import { Banner, Button, SettingsChoice, SettingsRow, SettingsSection, TextField } from '@/components';
import { fontFamily, makeStyles, spacing, typography, useTheme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { usePreferencesStore, type AppLanguage, type ThemePreference } from '@/stores/preferencesStore';
import { usePatchMe, useDeleteAccount } from '@/api/hooks/useUsers';
import { useLogout } from '@/api/hooks/useAuth';
import { isMockMode } from '@/api/network';
import { toUserMessage } from '@/api/errors';
import { chooseLanguage, LANGUAGE_AUTONYMS } from '@/i18n/language';
import { storage } from '@/utils/storage';
import { appVersionLabel } from '@/features/system/appInfo';

const BIOMETRIC_KEY = 'siren.prefs.biometricLock';

type Feedback = { kind: 'success' | 'error' | 'warning'; message: string } | null;

/**
 * Réglages — centre de contrôle du compte (CDC App §4.6).
 * Compte → Sécurité → Préférences → Famille → Informations → Actions sensibles.
 */
export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const theme = usePreferencesStore((s) => s.theme);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const notifPrefs = usePreferencesStore((s) => s.notifications);
  const setNotifPrefs = usePreferencesStore((s) => s.setNotifications);
  const logout = useLogout();
  const queryClient = useQueryClient();
  const patchMe = usePatchMe();
  const deleteAccount = useDeleteAccount();

  const [nom, setNom] = useState(user?.nom ?? '');
  const [biometricLock, setBiometricLock] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Le store d'auth s'hydrate de façon asynchrone : au premier rendu `user` est
  // encore null, et useState fige alors les champs sur une chaîne vide. On les
  // réalimente dès que le profil est disponible (ou qu'on change de compte).
  const userId = user?.id;
  useEffect(() => {
    const current = useAuthStore.getState().user;
    if (!current) return;
    setNom(current.nom ?? '');
  }, [userId]);

  useEffect(() => {
    storage.getItem<boolean>(BIOMETRIC_KEY).then((bio) => setBiometricLock(!!bio)).catch(() => {});
  }, []);

  const profileDirty = nom.trim() !== (user?.nom ?? '');

  async function saveProfile() {
    setFeedback(null);
    if (nom.trim().length < 2) {
      setFeedback({ kind: 'error', message: t('validation.nameTooShort') });
      return;
    }
    try {
      await patchMe.mutateAsync({ nom: nom.trim() });
      setFeedback({ kind: 'success', message: t('settings.profileSaved') });
    } catch (e) {
      setFeedback({ kind: 'error', message: toUserMessage(e) });
    }
  }

  async function changeLanguage(lang: AppLanguage) {
    setFeedback(null);
    // Bascule immédiate de l'interface, mémorisée sur ce téléphone.
    await chooseLanguage(lang);
    try {
      // Le serveur en a besoin pour les notifications et les emails : on le dit si l'envoi échoue.
      await patchMe.mutateAsync({ langue: lang });
    } catch {
      setFeedback({ kind: 'warning', message: t('settings.language.syncPending') });
    }
  }

  async function toggleBiometric(value: boolean) {
    setBiometricLock(value);
    await storage.setItem(BIOMETRIC_KEY, value);
  }

  async function handleReset() {
    setResetting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      await require('@/api/mock/entry').resetMockBackend();
      queryClient.clear();
      setFeedback({ kind: 'success', message: t('settings.demo.resetDone') });
    } finally {
      setResetting(false);
    }
  }

  function confirmLogout() {
    RNAlert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logout'), onPress: () => logout.mutate() },
    ]);
  }

  function confirmDeleteAccount() {
    RNAlert.alert(t('settings.deleteTitle'), t('settings.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setFeedback(null);
          try {
            await deleteAccount.mutateAsync();
          } catch (e) {
            setFeedback({ kind: 'error', message: toUserMessage(e) });
          }
        },
      },
    ]);
  }

  const languageOptions = (['fr', 'en'] as const).map((key) => ({ key, label: LANGUAGE_AUTONYMS[key] }));
  const themeOptions: { key: ThemePreference; label: string }[] = [
    { key: 'system', label: t('settings.appearance.system') },
    { key: 'light', label: t('settings.appearance.light') },
    { key: 'dark', label: t('settings.appearance.dark') },
  ];

  const switchProps = { trackColor: { false: colors.border, true: colors.primary }, thumbColor: colors.onPrimary };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title} accessibilityRole="header">{t('tabs.settings')}</Text>

          {feedback && (
            <View style={styles.feedback}>
              <Banner kind={feedback.kind} message={feedback.message} />
            </View>
          )}

          <SettingsSection title={t('settings.sections.account')}>
            <View style={styles.form}>
              <TextField label={t('common.name')} value={nom} onChangeText={setNom} autoComplete="name" />
              <TextField
                label={t('auth.email')}
                required={false}
                value={user?.email ?? ''}
                editable={false}
                placeholder={t('settings.emailNone')}
                hint={!user?.email ? t('settings.emailOptional') : user.emailVerified === false ? t('settings.emailNotVerified') : t('settings.emailReadOnly')}
              />
              <Button label={t('common.save')} onPress={saveProfile} loading={patchMe.isPending} disabled={!profileDirty} />
            </View>
            <SettingsRow
              icon={Smartphone}
              label={t('settings.phone.rowLabel')}
              description={
                user?.telephone
                  ? `${user.telephone} · ${t(user.phoneVerified ? 'settings.phone.verified' : 'settings.phone.notVerified')}`
                  : t('settings.phone.missing')
              }
              onPress={() => router.push('/(main)/settings/phone')}
            />
          </SettingsSection>

          <SettingsSection title={t('settings.sections.security')}>
            <SettingsRow
              icon={KeyRound}
              label={t('settings.security.passwordAnd2fa')}
              description={user?.twofaEnabled ? t('settings.security.twofaOn') : t('settings.security.twofaOff')}
              onPress={() => router.push('/(main)/settings/security')}
            />
            <SettingsRow
              icon={Fingerprint}
              label={t('settings.biometricLock')}
              description={t('settings.biometricDesc')}
              trailing={
                <Switch value={biometricLock} onValueChange={toggleBiometric} accessibilityLabel={t('settings.biometricLock')} {...switchProps} />
              }
            />
          </SettingsSection>

          <SettingsSection title={t('settings.sections.preferences')}>
            <View>
              <Text style={styles.inlineLabel}>{t('settings.language.title')}</Text>
              <SettingsChoice
                options={languageOptions}
                value={i18n.language === 'en' ? 'en' : 'fr'}
                onChange={changeLanguage}
                accessibilityLabel={t('settings.language.title')}
              />
            </View>
            <View>
              <Text style={styles.inlineLabel}>{t('settings.appearance.title')}</Text>
              <SettingsChoice
                options={themeOptions}
                value={theme}
                onChange={(value) => void setTheme(value)}
                accessibilityLabel={t('settings.appearance.title')}
              />
            </View>
          </SettingsSection>

          <SettingsSection title={t('settings.sections.notifications')} footer={t('settings.notif.scope')}>
            <SettingsRow icon={BellRing} label={t('settings.notif.urgence')} description={t('settings.notif.urgenceAlways')} value={t('settings.notif.alwaysOn')} />
            <SettingsRow
              label={t('settings.notif.prealerte')}
              trailing={
                <Switch
                  value={notifPrefs.prealerte}
                  onValueChange={(v) => void setNotifPrefs({ prealerte: v })}
                  accessibilityLabel={t('settings.notif.prealerte')}
                  {...switchProps}
                />
              }
            />
            <SettingsRow
              label={t('settings.notif.information')}
              trailing={
                <Switch
                  value={notifPrefs.information}
                  onValueChange={(v) => void setNotifPrefs({ information: v })}
                  accessibilityLabel={t('settings.notif.information')}
                  {...switchProps}
                />
              }
            />
            <SettingsRow
              icon={Smartphone}
              label={t('settings.notif.systemSettings')}
              description={t('settings.notif.systemSettingsDesc')}
              onPress={() => void Linking.openSettings()}
            />
          </SettingsSection>

          {user?.role === 'principal' && (
            <SettingsSection title={t('settings.sections.family')}>
              <SettingsRow icon={Baby} label={t('settings.family.children')} onPress={() => router.push('/(main)/(tabs)')} />
              <SettingsRow icon={Users} label={t('settings.family.sharing')} onPress={() => router.push('/(main)/(tabs)/sharing')} />
            </SettingsSection>
          )}

          <SettingsSection title={t('settings.sections.information')}>
            <SettingsRow icon={Info} label={t('settings.about.title')} value={appVersionLabel()} onPress={() => router.push('/(main)/settings/about')} />
            <SettingsRow icon={FileText} label={t('legal.title')} description={t('legal.listSubtitle')} onPress={() => router.push('/legal')} />
          </SettingsSection>

          {isMockMode() && (
            <SettingsSection title={t('settings.demo.title')} footer={t('settings.demo.body')}>
              <SettingsRow icon={RotateCcw} label={t('settings.demo.reset')} onPress={handleReset} disabled={resetting} />
              <SettingsRow
                icon={WifiOff}
                label={t('settings.demo.simulateOffline')}
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                onPress={() => require('@/api/mock/entry').simulateMockDisconnect(8000)}
              />
            </SettingsSection>
          )}

          <SettingsSection title={t('settings.sections.session')}>
            <SettingsRow icon={LogOut} label={t('settings.logout')} onPress={confirmLogout} disabled={logout.isPending} />
            <SettingsRow
              icon={Trash2}
              label={t('settings.deleteAccount')}
              description={t('settings.deleteAccountDesc')}
              onPress={confirmDeleteAccount}
              destructive
              disabled={deleteAccount.isPending}
            />
          </SettingsSection>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxxl },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.lg },
  feedback: { marginBottom: spacing.lg },
  form: { padding: spacing.lg, paddingBottom: spacing.md },
  inlineLabel: {
    ...typography.body,
    fontFamily: fontFamily.medium,
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
}));
