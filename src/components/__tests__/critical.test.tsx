import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import i18n from '@/i18n';
import { SerialInput } from '../SerialInput';

/**
 * Tests d'interface des écrans critiques (structure et comportement, rendu
 * React Native Testing Library). Ils ne remplacent PAS une vérification visuelle
 * sur appareil réel (tailles d'écran, polices agrandies) : voir docs/PLAN_TESTS_SECURITE.md.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ childId: 'child_1' }),
  useFocusEffect: () => {},
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-haptics', () => ({ notificationAsync: () => Promise.resolve(), NotificationFeedbackType: { Error: 'error' } }));
jest.mock('@/features/tracking/map', () => {
  const { View } = jest.requireActual('react-native');
  return { MapView: ({ children }: { children?: React.ReactNode }) => <View testID="map">{children}</View>, Marker: () => null };
});

const LONG_NAME = 'Marie-Christelle Ngo Bissai Mbarga';
jest.mock('@/api/hooks/useTracking', () => ({
  usePosition: () => ({ data: { lat: 4.05, lon: 9.7, timestamp: new Date().toISOString(), fixQuality: 'gps_recent', heading: 90, speedKmh: 40 } }),
}));
jest.mock('@/api/hooks/useRisk', () => ({
  useRisk: () => ({ data: { state: 'urgence', score: 92, reasons: ['zone_interdite:g1', 'vitesse_critique:95'] } }),
}));
jest.mock('@/api/hooks/useChildren', () => ({ useChildren: () => ({ data: [{ id: 'child_1', prenom: 'Marie-Christelle Ngo Bissai Mbarga' }] }) }));
jest.mock('@/api/hooks/useEmergencyContacts', () => ({
  useEmergencyContacts: () => ({
    data: [
      { id: 'c1', nom: 'Papa', telephone: '+237 6 55 44 33 22' },
      { id: 'c2', nom: 'Grand-mère Rose', telephone: '+237 6 77 22 11 00' },
    ],
  }),
}));
jest.mock('@/api/hooks/useSearchZone', () => ({ useTriggerDisappearance: () => ({ mutateAsync: jest.fn(), isPending: false }) }));
jest.mock('@/api/hooks/useGeofences', () => ({ useGeofences: () => ({ data: [{ id: 'g1', nom: 'Chantier' }] }) }));
jest.mock('@/features/sharing/useCurrentAccess', () => ({ useCurrentAccess: () => ({ can: () => true }) }));

beforeEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('fr');
  });
});

describe('écran d’alerte critique', () => {
  const EmergencyScreen = jest.requireActual('../../app/(emergency)/urgence').default as React.ComponentType;

  it('garde les appels vitaux hors du défilement (jamais masqués par le contenu)', async () => {
    await render(<EmergencyScreen />);
    const scroll = screen.getByTestId('emergency-scroll');
    const sticky = screen.getByTestId('emergency-sticky-actions');
    expect(within(sticky).getByTestId('emergency-call-help')).toBeTruthy();
    expect(within(sticky).getByTestId('emergency-call-contact')).toBeTruthy();
    expect(within(scroll).queryByTestId('emergency-call-help')).toBeNull();
    // Les autres proches restent joignables dans la zone défilante.
    expect(within(scroll).getByText(/Grand-mère Rose/)).toBeTruthy();
  });

  it('n’affiche jamais les codes techniques des raisons', async () => {
    await render(<EmergencyScreen />);
    expect(screen.queryByText(/zone_interdite|vitesse_critique|g1/)).toBeNull();
    expect(screen.getByText(/Chantier/)).toBeTruthy();
  });

  it('affiche le nom long en entier (pas de troncature) et la carte ne capte pas le défilement', async () => {
    await render(<EmergencyScreen />);
    const title = screen.getByText(new RegExp(LONG_NAME));
    expect(title.props.numberOfLines).toBeUndefined();
    // Masquée aux lecteurs d'écran (la position est décrite en texte) et sans capture des gestes.
    expect(screen.getByTestId('emergency-map', { includeHiddenElements: true }).props.pointerEvents).toBe('none');
  });

  it('appelle les secours par le numéro configuré', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<EmergencyScreen />);
    await fireEvent.press(screen.getByTestId('emergency-call-help'));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^tel:\+?\d+$/));
  });
});

describe('saisie du numéro de série', () => {
  function Harness({ onComplete }: { onComplete: (s: string) => void }) {
    const [body, setBody] = React.useState('');
    return <SerialInput label="Numéro" body={body} onChangeBody={setBody} onComplete={onComplete} />;
  }

  it('affiche SIREN- en préfixe et le tiret automatiquement, sans changer la casse', async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    expect(screen.getByText('SIREN-', { includeHiddenElements: true })).toBeTruthy();
    const input = screen.getByTestId('serial-input');
    await fireEvent.changeText(input, 'ab12C');
    expect(input.props.value).toBe('ab12C');
    await fireEvent.changeText(input, 'ab12Cx');
    expect(input.props.value).toBe('ab12C-x');
    await fireEvent.changeText(input, 'ab12C-xY9z0');
    expect(onComplete).toHaveBeenCalledWith('SIREN-ab12C-xY9z0');
  });

  it('accepte le collage du numéro complet et signale les caractères refusés', async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    const input = screen.getByTestId('serial-input');
    await fireEvent.changeText(input, 'SIREN-AB12C-XY9Z0');
    expect(onComplete).toHaveBeenCalledWith('SIREN-AB12C-XY9Z0');
    await fireEvent.changeText(input, 'AB12C-XY9Z');
    await fireEvent.changeText(input, 'AB12C-XY9Zé');
    expect(screen.getByText(/Seuls les lettres/)).toBeTruthy();
    expect(input.props.value).toBe('AB12C-XY9Z');
  });
});
