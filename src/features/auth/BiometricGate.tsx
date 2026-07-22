import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint } from 'lucide-react-native';
import { Button } from '@/components';
import { colors, fontFamily, spacing, typography } from '@/theme';
import { storage } from '@/utils/storage';
import { logger } from '@/utils/logger';

const BIOMETRIC_KEY = 'siren.prefs.biometricLock';

/** Verrouillage biométrique optionnel à l'ouverture — CDC1 §13.2. Non bloquant si indisponible. */
export function BiometricGate({ children }: { children: React.ReactNode }) {
  const [required, setRequired] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const enabled = await storage.getItem<boolean>(BIOMETRIC_KEY);
      if (!enabled) {
        setChecked(true);
        setUnlocked(true);
        return;
      }
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        setChecked(true);
        setUnlocked(true);
        return;
      }
      setRequired(true);
      setChecked(true);
      void attemptUnlock();
    })();
  }, []);

  async function attemptUnlock() {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Déverrouiller SIREN",
        cancelLabel: 'Annuler',
      });
      if (result.success) setUnlocked(true);
    } catch (error) {
      logger.error(error, { stage: 'biometric-unlock' });
    }
  }

  if (!checked) return null;
  if (!required || unlocked) return <>{children}</>;

  return (
    <View style={styles.container}>
      <Fingerprint size={56} color={colors.primary} />
      <Text style={styles.title}>Application verrouillée</Text>
      <Text style={styles.subtitle}>Authentifiez-vous pour continuer.</Text>
      <Button label="Déverrouiller" onPress={attemptUnlock} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  title: { ...typography.title2, fontFamily: fontFamily.semiBold, color: colors.ink },
  subtitle: { ...typography.body, color: colors.muted, marginBottom: spacing.md },
});
