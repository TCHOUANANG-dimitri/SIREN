import { useEffect, useState } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

/**
 * Masque le contenu quand l'app quitte le premier plan, pour que l'aperçu du
 * sélecteur d'applications n'expose ni carte ni position d'enfant (CDC App §8
 * Sécurité : « flou de l'app en arrière-plan »).
 */
export function PrivacyShield() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setHidden(state !== 'active');
    });
    return () => subscription.remove();
  }, []);

  if (!hidden) return null;
  return (
    <View style={styles.shield} pointerEvents="none">
      <Image source={require('../../../assets/images/siren-logo.png')} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  shield: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 160, height: 107 },
});
