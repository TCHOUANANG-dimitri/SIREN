import { useEffect, useState } from 'react';
import { Alert as RNAlert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { LogOut, RotateCcw, ShieldQuestion, Trash2 } from 'lucide-react-native';
import { Banner, Button, Card, PermissionToggle, TextField } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { usePatchMe, useDeleteAccount } from '@/api/hooks/useUsers';
import { resetMockBackend } from '@/api/mock/bootstrap';
import { mockEventBus } from '@/api/mock/mockEventBus';
import { isTranslationApiActive } from '@/services/translationService';
import { storage } from '@/utils/storage';

const NOTIF_PREFS_KEY = 'siren.prefs.notifications';
const BIOMETRIC_KEY = 'siren.prefs.biometricLock';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const patchMe = usePatchMe();
  const deleteAccount = useDeleteAccount();

  const [nom, setNom] = useState(user?.nom ?? '');
  const [telephone, setTelephone] = useState(user?.telephone ?? '');
  const [saved, setSaved] = useState(false);
  const [notifUrgence, setNotifUrgence] = useState(true);
  const [notifPrealerte, setNotifPrealerte] = useState(true);
  const [notifInfo, setNotifInfo] = useState(true);
  const [biometricLock, setBiometricLock] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    (async () => {
      const prefs = await storage.getItem<{ urgence: boolean; prealerte: boolean; info: boolean }>(NOTIF_PREFS_KEY);
      if (prefs) {
        setNotifUrgence(prefs.urgence);
        setNotifPrealerte(prefs.prealerte);
        setNotifInfo(prefs.info);
      }
      const bio = await storage.getItem<boolean>(BIOMETRIC_KEY);
      setBiometricLock(!!bio);
    })();
  }, []);

  async function saveProfile() {
    await patchMe.mutateAsync({ nom, telephone });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function changeLanguage(lang: 'fr' | 'en') {
    await i18n.changeLanguage(lang);
    await patchMe.mutateAsync({ langue: lang });
  }

  async function updateNotifPrefs(next: Partial<{ urgence: boolean; prealerte: boolean; info: boolean }>) {
    const merged = {
      urgence: next.urgence ?? notifUrgence,
      prealerte: next.prealerte ?? notifPrealerte,
      info: next.info ?? notifInfo,
    };
    setNotifUrgence(merged.urgence);
    setNotifPrealerte(merged.prealerte);
    setNotifInfo(merged.info);
    await storage.setItem(NOTIF_PREFS_KEY, merged);
  }

  async function toggleBiometric(value: boolean) {
    setBiometricLock(value);
    await storage.setItem(BIOMETRIC_KEY, value);
  }

  async function handleReset() {
    setResetting(true);
    await resetMockBackend();
    queryClient.clear();
    setResetting(false);
  }

  async function handleLogout() {
    queryClient.clear();
    await logout();
  }

  function confirmDeleteAccount() {
    RNAlert.alert(
      'Supprimer le compte',
      'Cette action supprime définitivement votre compte et les données de vos enfants. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteAccount.mutateAsync();
            queryClient.clear();
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('tabs.settings')}</Text>

      {saved && <Banner kind="success" message="Préférences enregistrées" />}

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Profil</Text>
        <TextField label="Nom" value={nom} onChangeText={setNom} />
        <TextField label="Email" value={user?.email ?? ''} editable={false} />
        <TextField label="Téléphone" required={false} value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" />
        <Button label={t('common.save')} onPress={saveProfile} loading={patchMe.isPending} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Langue & Traduction</Text>
        <View style={styles.langRow}>
          <Button
            label="Français"
            variant={i18n.language === 'fr' ? 'primary' : 'secondary'}
            onPress={() => changeLanguage('fr')}
            fullWidth={false}
            style={styles.langButton}
          />
          <Button
            label="English"
            variant={i18n.language === 'en' ? 'primary' : 'secondary'}
            onPress={() => changeLanguage('en')}
            fullWidth={false}
            style={styles.langButton}
          />
        </View>
        <View style={styles.apiBadgeRow}>
          <Text style={styles.apiBadgeText}>
            {isTranslationApiActive()
              ? '⚡ Clé API Traduction active (DeepL / Google Translate)'
              : 'ℹ️ Mode dictionnaire local (Définissez EXPO_PUBLIC_TRANSLATION_API_KEY pour l\'API)'}
          </Text>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Notifications</Text>
        <PermissionToggle label="Urgence" value={notifUrgence} onValueChange={(v) => updateNotifPrefs({ urgence: v })} />
        <PermissionToggle label="Pré-alerte" value={notifPrealerte} onValueChange={(v) => updateNotifPrefs({ prealerte: v })} />
        <PermissionToggle label="Informations (zone, batterie)" value={notifInfo} onValueChange={(v) => updateNotifPrefs({ info: v })} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Sécurité</Text>
        <PermissionToggle
          label="Verrouillage biométrique"
          description="Demander Face ID / empreinte à l'ouverture de l'application."
          value={biometricLock}
          onValueChange={toggleBiometric}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Mode démonstration</Text>
        <Text style={styles.cardBody}>
          Réinitialise les données de démo (enfants, alertes, historique) et relance le scénario depuis le début.
        </Text>
        <Button
          label="Réinitialiser la démo"
          variant="secondary"
          icon={<RotateCcw size={16} color={colors.primary} />}
          onPress={handleReset}
          loading={resetting}
          style={{ marginBottom: spacing.sm }}
        />
        <Button
          label="Simuler une coupure réseau (8 s)"
          variant="ghost"
          onPress={() => mockEventBus.simulateDisconnect(8000)}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>À propos</Text>
        <View style={styles.aboutRow}>
          <ShieldQuestion size={16} color={colors.muted} />
          <Text style={styles.aboutText}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
        </View>
        <Text style={styles.aboutLink} onPress={() => RNAlert.alert('Mentions légales', 'SIREN — projet de protection des enfants.')}>
          Mentions légales
        </Text>
        <Text
          style={styles.aboutLink}
          onPress={() =>
            RNAlert.alert(
              'Politique de confidentialité',
              "Minimisation des données, consentement explicite à l'inscription, suppression possible à tout moment."
            )
          }
        >
          Politique de confidentialité
        </Text>
      </Card>

      <Button label="Se déconnecter" variant="secondary" icon={<LogOut size={16} color={colors.primary} />} onPress={handleLogout} />
      <View style={{ height: spacing.sm }} />
      <Button
        label="Supprimer mon compte et mes données"
        variant="ghost"
        icon={<Trash2 size={16} color={colors.urgence} />}
        onPress={confirmDeleteAccount}
      />
    </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scrollContainer: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.xxxl, paddingBottom: spacing.xxxl, gap: spacing.md },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.sm },
  card: { marginBottom: spacing.md },
  cardTitle: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, marginBottom: spacing.sm },
  cardBody: { ...typography.caption, color: colors.muted, marginBottom: spacing.md },
  langRow: { flexDirection: 'row', gap: spacing.sm },
  langButton: { flex: 1 },
  apiBadgeRow: { marginTop: spacing.sm, paddingTop: spacing.xs },
  apiBadgeText: { ...typography.caption, color: colors.muted, lineHeight: 18 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  aboutText: { ...typography.body, color: colors.slate },
  aboutLink: { ...typography.body, fontFamily: fontFamily.medium, color: colors.primary, marginBottom: spacing.sm },
});
