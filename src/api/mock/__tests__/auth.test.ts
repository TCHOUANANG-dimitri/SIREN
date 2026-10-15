import { initDb, mutateDb } from '../db';
import { buildSeed } from '../seed';
import * as auth from '../services/authService';

jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  simulateLatency: () => Promise.resolve(),
}));

const PASSWORD = 'Yaounde2026!';

async function newAccount(twofa = false) {
  const email = `parent-${Math.random().toString(36).slice(2)}@example.org`;
  const session = await auth.register({ nom: 'Parent Test', email, password: PASSWORD, langue: 'fr' });
  if (twofa) mutateDb((d) => void Object.assign(d.users.find((u) => u.id === session.user.id)!, { twofaEnabled: true }));
  return { email, session };
}

describe('authentification simulée (mêmes règles que le serveur)', () => {
  beforeEach(async () => {
    await initDb(buildSeed, true);
  });

  it('2FA : aucune session avant le code, session après', async () => {
    const { email } = await newAccount(true);
    const login = await auth.login({ email, password: PASSWORD });
    expect(login.twofaRequired).toBe(true);
    expect(login).not.toHaveProperty('accessToken');
    if (!login.twofaRequired) throw new Error('2FA attendue');
    await expect(auth.verifySecondFactor({ challengeToken: login.challengeToken, code: '000000' })).rejects.toMatchObject({ reason: 'otp_invalid' });
    const session = await auth.verifySecondFactor({ challengeToken: login.challengeToken, code: auth.DEMO_OTP_CODE });
    expect(session.accessToken).toBeTruthy();
    // Usage unique.
    await expect(auth.verifySecondFactor({ challengeToken: login.challengeToken, code: auth.DEMO_OTP_CODE })).rejects.toMatchObject({ reason: 'otp_expired' });
  });

  it('5 essais maximum, puis le code est grillé même s’il est juste', async () => {
    const { email } = await newAccount(true);
    const login = await auth.login({ email, password: PASSWORD });
    if (!login.twofaRequired) throw new Error('2FA attendue');
    for (let i = 0; i < 5; i += 1) await auth.verifySecondFactor({ challengeToken: login.challengeToken, code: '999999' }).catch(() => {});
    await expect(auth.verifySecondFactor({ challengeToken: login.challengeToken, code: auth.DEMO_OTP_CODE })).rejects.toMatchObject({
      reason: 'otp_attempts_exceeded',
    });
  });

  it('un nouveau code invalide le précédent', async () => {
    const { email } = await newAccount(true);
    const login = await auth.login({ email, password: PASSWORD });
    if (!login.twofaRequired) throw new Error('2FA attendue');
    const again = await auth.resendSecondFactor(login.challengeToken);
    await expect(auth.verifySecondFactor({ challengeToken: login.challengeToken, code: auth.DEMO_OTP_CODE })).rejects.toMatchObject({ reason: 'otp_expired' });
    await expect(auth.verifySecondFactor({ challengeToken: again.challengeToken, code: auth.DEMO_OTP_CODE })).resolves.toHaveProperty('accessToken');
  });

  it('mot de passe oublié : même réponse pour un email inconnu, réinitialisation effective', async () => {
    const unknown = await auth.forgotPassword('inconnu@example.org');
    expect(Object.keys(unknown).sort()).toEqual(['challengeToken', 'devHint', 'expiresIn']);
    await expect(auth.resetPassword({ challengeToken: unknown.challengeToken, code: auth.DEMO_OTP_CODE, newPassword: 'Nouveau2026!' })).rejects.toBeTruthy();

    const { email } = await newAccount();
    const challenge = await auth.forgotPassword(email.toUpperCase());
    await auth.resetPassword({ challengeToken: challenge.challengeToken, code: auth.DEMO_OTP_CODE, newPassword: 'Nouveau2026!' });
    await expect(auth.login({ email, password: PASSWORD })).rejects.toMatchObject({ reason: 'invalid_credentials' });
    await expect(auth.login({ email, password: 'Nouveau2026!' })).resolves.toMatchObject({ twofaRequired: false });
  });

  it('changer le mot de passe ou la 2FA exige le mot de passe actuel', async () => {
    const { session } = await newAccount();
    await expect(auth.changePassword(session.accessToken, { currentPassword: 'faux', newPassword: 'Nouveau2026!' })).rejects.toMatchObject({
      reason: 'password_incorrect',
    });
    await expect(auth.setTwoFactor(session.accessToken, { enabled: true, password: 'faux' })).rejects.toMatchObject({ reason: 'password_incorrect' });
    await expect(auth.setTwoFactor(session.accessToken, { enabled: true, password: PASSWORD })).resolves.toMatchObject({ twofaEnabled: true });
  });
});
