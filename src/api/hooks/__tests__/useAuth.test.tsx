import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { ApiError } from '@/api/errors';
import { usePendingAuthStore } from '@/stores/pendingAuthStore';
import { useLogin, useRegister } from '../useAuth';

/**
 * Parcours bloquants relevés par la revue indépendante : un échec d'envoi du
 * premier code ne doit ni perdre le compte créé, ni empêcher de choisir un autre canal.
 */

const mockAuth = {
  register: jest.fn(),
  otpChannels: jest.fn(),
  requestOtp: jest.fn(),
  login: jest.fn(),
  sendSecondFactor: jest.fn(),
};
// Accesseur : le module est importé (hissé) avant l'initialisation de mockAuth.
jest.mock('@/api', () => ({
  get api() {
    return { auth: mockAuth };
  },
}));

const user = { id: 'u1', nom: 'Awa', email: null, telephone: '+237690123456', phoneVerified: false };
const session = { user, accessToken: 'a', refreshToken: 'r' };

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  usePendingAuthStore.getState().clear();
});

test("inscription : un envoi refusé (plafond) garde la session et ouvre l'écran du code", async () => {
  mockAuth.register.mockResolvedValue(session);
  mockAuth.otpChannels.mockResolvedValue(['sms', 'whatsapp']);
  mockAuth.requestOtp.mockRejectedValue(new ApiError('Trop de codes', 429, undefined, undefined, 'otp_rate_limited'));
  const { result } = await renderHook(() => useRegister(), { wrapper });
  let outcome: { otpRequired: boolean } | undefined;
  await act(async () => {
    outcome = await result.current.mutateAsync({ nom: 'Awa', telephone: '690123456', password: 'Douala2026!' });
  });
  expect(outcome).toEqual({ otpRequired: true });
  const state = usePendingAuthStore.getState();
  expect(state.pending).toMatchObject({ kind: 'register', session, challengeToken: null });
  expect(state.deliveryError).toBeTruthy();
  expect(state.channels).toEqual(['sms', 'whatsapp']);
});

test('connexion 2FA : premier canal en échec, la vérification reste ouverte pour un autre canal', async () => {
  mockAuth.login.mockResolvedValue({ twofaRequired: true, mfaToken: 'mfa', channels: ['sms', 'whatsapp'] });
  mockAuth.sendSecondFactor.mockRejectedValue(new ApiError('Envoi impossible', 502, undefined, undefined, 'delivery_failed'));
  const { result } = await renderHook(() => useLogin(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ identifier: '690123456', password: 'Douala2026!' });
  });
  const state = usePendingAuthStore.getState();
  expect(state.pending).toMatchObject({ kind: 'login', mfaToken: 'mfa' });
  expect(state.channels).toEqual(['sms', 'whatsapp']);
  expect(state.deliveryError).toBeTruthy();
  // Un renvoi réussi efface l'erreur affichée.
  act(() => usePendingAuthStore.getState().renew('tok', { channel: 'whatsapp' }));
  expect(usePendingAuthStore.getState().deliveryError).toBeNull();
});
