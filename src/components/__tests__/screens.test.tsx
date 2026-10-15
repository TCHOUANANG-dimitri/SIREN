import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import i18n from '@/i18n';
import { SettingsChoice } from '../SettingsList';
import { useTheme, darkColors, lightColors } from '@/theme';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { ChildSelector } from '@/features/children/ChildSelector';
import type { Child } from '@/models/entities';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ doc: 'privacy' }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

beforeEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('fr');
    usePreferencesStore.setState({ theme: 'system' });
  });
});

describe('document juridique', () => {
  // Import après les mocks.
  const LegalDocumentScreen = jest.requireActual('../../app/legal/[doc]').default as React.ComponentType;

  it('affiche le texte complet, la version et le bandeau « provisoire »', async () => {
    await render(<LegalDocumentScreen />);
    expect(screen.getByText('Politique de confidentialité')).toBeTruthy();
    expect(screen.getByText(/Version 2026-09-30/)).toBeTruthy();
    expect(screen.getByText(/Version provisoire/)).toBeTruthy();
    expect(screen.getByText('Vos droits')).toBeTruthy();
  });

  it('suit la langue de l’interface', async () => {
    await render(<LegalDocumentScreen />);
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(screen.getByText('Privacy policy')).toBeTruthy();
    expect(screen.queryByText('Politique de confidentialité')).toBeNull();
  });
});

describe('changement de thème', () => {
  function Probe() {
    const { colors, scheme } = useTheme();
    return <Text testID="probe">{`${scheme}:${colors.surface}`}</Text>;
  }

  it('le choix « Sombre » applique la palette sombre immédiatement', async () => {
    await render(
      <>
        <SettingsChoice
          options={[
            { key: 'system', label: 'Système' },
            { key: 'light', label: 'Clair' },
            { key: 'dark', label: 'Sombre' },
          ]}
          value="system"
          onChange={(value) => usePreferencesStore.setState({ theme: value })}
          accessibilityLabel="Apparence"
        />
        <Probe />
      </>
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Sombre' }));
    expect(screen.getByTestId('probe').props.children).toBe(`dark:${darkColors.surface}`);
    await fireEvent.press(screen.getByRole('radio', { name: 'Clair' }));
    expect(screen.getByTestId('probe').props.children).toBe(`light:${lightColors.surface}`);
  });
});

describe('sélecteur d’enfant', () => {
  const kids = [
    { id: 'a', prenom: 'Léa' },
    { id: 'b', prenom: 'Awa' },
  ] as Child[];

  it('chaque enfant est un onglet pressable qui sélectionne le bon enfant', async () => {
    const onSelect = jest.fn();
    await render(<ChildSelector childrenList={kids} activeId="a" onSelect={onSelect} contextLabel="Carte" />);
    const awa = screen.getByRole('tab', { name: 'Awa' });
    expect(screen.getByRole('tab', { name: 'Léa' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(awa.props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(awa);
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('reste visible avec un seul enfant (on sait toujours sur qui on agit)', async () => {
    await render(<ChildSelector childrenList={[kids[0]]} activeId="a" onSelect={jest.fn()} contextLabel="Partage" />);
    expect(screen.getByRole('tab', { name: 'Léa' })).toBeTruthy();
  });
});
