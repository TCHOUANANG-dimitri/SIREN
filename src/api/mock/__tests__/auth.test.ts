import { initDb, mutateDb } from '../db';
import { buildSeed } from '../seed';
import * as auth from '../services/authService';

jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  simulateLatency: () => Promise.resolve(),
}));

const PASSWORD = 'Yaounde2026!';
let counter = 0;

function newPhone() {
  counter += 1;
  return `+2376990${String(100000 + counter).slice(1)}`;
}

async function newAccount(twofa = false, extra: { email?: string } = {}) {
  const telephone = newPhone();
  const result = await auth.register({ nom: 'Awa', telephone, password: PASSWORD, langue: 'fr', ...extra });
  if (twofa) {
    mutateDb((d) => {
      const u = d.users.find((x) => x.id === result.user.id);
      if (u) u.twofaEnabled = true;
    });
  }
  return { ...result, telephone };
}

async function mfa(identifier: string) {
  const result = await auth.login({ identifier, password: PASSWORD });
  if (!result.twofaRequired) throw new Error('2FA attendue');
  return result;
}

beforeEach(async () => {
  await initDb(buildSeed, true);
});

describe('authentification simulée (mêmes règles que le serveur)', () => {
  it('inscription : téléphone obligatoire et normalisé, e-mail facultatif jamais inventé', async () => {
    const { user, telephone } = await newAccount();
    expect(user.telephone).toBe(telephone);
    expect(user.email).toBeNull();
    await expect(auth.register({ nom: 'X', telephone: '12', password: PASSWORD, langue: 'fr' })).rejects.toMatchObject({ reason: 'phone_invalid' });
    await expect(auth.register({ nom: 'X', telephone: telephone.replace('+237', ''), password: PASSWORD, langue: 'fr' })).rejects.toMatchObject({
      reason: 'phone_taken',
    });
  });

  it('connexion par téléphone (tout format) ou par e-mail', async () => {
    const { telephone } = await newAccount(false, { email: 'awa@example.org' });
    await expect(auth.login({ identifier: telephone.replace('+237', '0 0237 '), password: PASSWORD })).resolves.toMatchObject({ twofaRequired: false });
    await expect(auth.login({ identifier: 'AWA@example.org', password: PASSWORD })).resolves.toMatchObject({ twofaRequired: false });
    await expect(auth.login({ identifier: telephone, password: 'mauvais' })).rejects.toMatchObject({ reason: 'invalid_credentials' });
  });

  it('second facteur : aucune session avant le code, e-mail non vérifié jamais proposé', async () => {
    const { telephone } = await newAccount(true, { email: 'awa@example.org' });
    const result = await mfa(telephone);
    expect(result).not.toHaveProperty('accessToken');
    expect(result.channels).toEqual(['sms', 'whatsapp']);
    await expect(auth.sendSecondFactor({ mfaToken: result.mfaToken, channel: 'email' })).rejects.toMatchObject({ reason: 'channel_not_allowed' });
    const challenge = await auth.sendSecondFactor({ mfaToken: result.mfaToken, channel: 'whatsapp' });
    expect(challenge.channel).toBe('whatsapp');
    const session = await auth.verifySecondFactor({ challengeToken: challenge.challengeToken, code: auth.DEMO_OTP_CODE.toLowerCase() });
    expect(session.accessToken).toBeTruthy();
    // Usage unique.
    await expect(auth.verifySecondFactor({ challengeToken: challenge.challengeToken, code: auth.DEMO_OTP_CODE })).rejects.toMatchObject({ reason: 'otp_expired' });
  });

  it('5 essais par code, puis code grillé', async () => {
    const { telephone } = await newAccount(true);
    const challenge = await auth.sendSecondFactor({ mfaToken: (await mfa(telephone)).mfaToken, channel: 'sms' });
    for (let i = 0; i < 5; i += 1) {
      await expect(auth.verifySecondFactor({ challengeToken: challenge.challengeToken, code: 'ZZZZZZ' })).rejects.toMatchObject({ reason: 'otp_invalid' });
    }
    await expect(auth.verifySecondFactor({ challengeToken: challenge.challengeToken, code: auth.DEMO_OTP_CODE })).rejects.toMatchObject({
      reason: 'otp_attempts_exceeded',
    });
  });

  it('un renvoi invalide le code précédent', async () => {
    const { telephone } = await newAccount(true);
    const { mfaToken } = await mfa(telephone);
    const first = await auth.sendSecondFactor({ mfaToken, channel: 'sms' });
    await auth.sendSecondFactor({ mfaToken, channel: 'whatsapp' });
    await expect(auth.verifySecondFactor({ challengeToken: first.challengeToken, code: auth.DEMO_OTP_CODE })).rejects.toMatchObject({ reason: 'otp_expired' });
  });

  it('mot de passe oublié : même réponse que le compte existe ou non, puis réinitialisation', async () => {
    const { telephone } = await newAccount();
    const unknown = await auth.forgotPassword({ identifier: '+237699999999', channel: 'sms' });
    const known = await auth.forgotPassword({ identifier: telephone, channel: 'sms' });
    expect(Object.keys(unknown).sort()).toEqual(Object.keys(known).sort());
    await expect(auth.resetPassword({ challengeToken: unknown.challengeToken, code: auth.DEMO_OTP_CODE, newPassword: 'Douala2026!x' })).rejects.toBeTruthy();
    await auth.resetPassword({ challengeToken: known.challengeToken, code: auth.DEMO_OTP_CODE, newPassword: 'Douala2026!x' });
    await expect(auth.login({ identifier: telephone, password: 'Douala2026!x' })).resolves.toMatchObject({ twofaRequired: false });
    await expect(auth.login({ identifier: telephone, password: PASSWORD })).rejects.toMatchObject({ reason: 'invalid_credentials' });
  });

  it('changement de numéro : mot de passe, numéro libre, code envoyé au nouveau numéro', async () => {
    const { accessToken } = await newAccount();
    const { telephone: taken } = await newAccount();
    const fresh = '+237677000999';
    await expect(auth.requestPhoneChange(accessToken, { currentPassword: 'mauvais', newPhone: fresh, channel: 'sms' })).rejects.toMatchObject({
      reason: 'password_incorrect',
    });
    await expect(auth.requestPhoneChange(accessToken, { currentPassword: PASSWORD, newPhone: taken, channel: 'sms' })).rejects.toMatchObject({
      reason: 'phone_taken',
    });
    const challenge = await auth.requestPhoneChange(accessToken, { currentPassword: PASSWORD, newPhone: fresh, channel: 'sms' });
    await expect(auth.confirmPhoneChange(accessToken, { challengeToken: challenge.challengeToken, code: 'ZZZZZZ' })).rejects.toMatchObject({
      reason: 'otp_invalid',
    });
    const user = await auth.confirmPhoneChange(accessToken, { challengeToken: challenge.challengeToken, code: auth.DEMO_OTP_CODE });
    expect(user).toMatchObject({ telephone: fresh, phoneVerified: true });
    // Un code d'un autre usage ne vaut pas pour un changement de numéro.
    const verify = await auth.requestOtp(accessToken, 'sms');
    await expect(auth.confirmPhoneChange(accessToken, { challengeToken: verify.challengeToken, code: auth.DEMO_OTP_CODE })).rejects.toMatchObject({
      reason: 'challenge_invalid',
    });
  });
});
