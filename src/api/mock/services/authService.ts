import { getDb, mutateDb, genId } from '../db';
import { reasonError } from '../../errors';
import { makeToken, simulateLatency, userIdFromToken } from '../helpers';
import { isPlausiblePhone, normalizePhoneInput } from '@/features/auth/phone';
import { normalizeOtpInput } from '@/features/auth/otpCode';
import type { User } from '@/models/entities';
import type { OtpChannel } from '../../contracts';

/**
 * Authentification SIMULÉE (mode démo uniquement, jamais embarquée en live).
 * Mêmes règles que le serveur (téléphone obligatoire, e-mail facultatif, codes
 * alphanumériques à usage unique, 5 essais, expiration, renvoi qui invalide le
 * précédent, usages séparés, pas de session avant le second facteur, e-mail
 * proposé seulement s'il est vérifié), mais le code est fixe et affiché à
 * l'écran (`devHint`) : aucun SMS, WhatsApp ni e-mail n'est envoyé.
 */

interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

type Purpose = 'phone_verify' | 'login_2fa' | 'password_reset' | 'phone_change';

interface MockChallenge {
  userId: string | null;
  purpose: Purpose;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
  pendingValue?: string;
}

export const DEMO_OTP_CODE = 'K7Q2M9';
const TTL_S = 600;
const MAX_ATTEMPTS = 5;
const MOCK_CHANNELS: OtpChannel[] = ['sms', 'whatsapp', 'email'];
const challenges = new Map<string, MockChallenge>();
const mfaTokens = new Map<string, { userId: string; expiresAt: number }>();

function issueChallenge(userId: string | null, purpose: Purpose, channel: OtpChannel, pendingValue?: string) {
  for (const c of challenges.values()) if (c.userId === userId && c.purpose === purpose) c.consumed = true;
  const token = `${genId('chal')}${Math.random().toString(36).slice(2, 12)}`;
  challenges.set(token, { userId, purpose, expiresAt: Date.now() + TTL_S * 1000, attempts: 0, consumed: false, pendingValue });
  return { challengeToken: token, expiresIn: TTL_S, devHint: DEMO_OTP_CODE, channel };
}

function consume(token: string | null, code: string, purpose: Purpose): MockChallenge & { userId: string } {
  const c = token ? challenges.get(token) : undefined;
  if (!c || c.purpose !== purpose) throw reasonError('challenge_invalid', 400);
  if (c.consumed || c.expiresAt <= Date.now()) throw reasonError('otp_expired', 400);
  if (c.attempts >= MAX_ATTEMPTS) throw reasonError('otp_attempts_exceeded', 429);
  if (normalizeOtpInput(code) !== DEMO_OTP_CODE) {
    c.attempts += 1;
    throw reasonError('otp_invalid', 400);
  }
  if (!c.userId) throw reasonError('otp_invalid', 400);
  c.consumed = true;
  return c as MockChallenge & { userId: string };
}

function session(user: User): AuthResult {
  return { user: withFlags(user), accessToken: makeToken(user.id), refreshToken: makeToken(user.id) };
}

function withFlags(user: User): User {
  return { ...user, phoneRequired: !user.telephone };
}

function findUser(userId: string): User {
  const user = getDb().users.find((u) => u.id === userId);
  if (!user) throw reasonError('challenge_invalid', 401);
  return user;
}

function phoneOrError(raw: string): string {
  if (!isPlausiblePhone(raw)) throw reasonError('phone_invalid', 422);
  return normalizePhoneInput(raw);
}

function findByIdentifier(identifier: string): User | undefined {
  const value = identifier.trim();
  const users = getDb().users;
  if (value.includes('@')) return users.find((u) => u.email?.toLowerCase() === value.toLowerCase());
  if (!isPlausiblePhone(value)) return undefined;
  const phone = normalizePhoneInput(value);
  return users.find((u) => u.telephone === phone);
}

/** Même règle que le serveur (otp.allowed_channels). */
function allowedChannels(user: User, purpose: Purpose): OtpChannel[] {
  const channels: OtpChannel[] = user.telephone || purpose === 'phone_change' ? ['sms', 'whatsapp'] : [];
  if (purpose !== 'phone_change' && user.email && user.emailVerified) channels.push('email');
  return channels;
}

function ensureAllowed(user: User, purpose: Purpose, channel: OtpChannel) {
  if (!allowedChannels(user, purpose).includes(channel)) throw reasonError('channel_not_allowed', 400);
}

export async function otpChannels(): Promise<OtpChannel[]> {
  return MOCK_CHANNELS;
}

export async function register(input: {
  nom: string;
  telephone: string;
  email?: string;
  password: string;
  langue: 'fr' | 'en';
}): Promise<AuthResult> {
  await simulateLatency(300, 700);
  const db = getDb();
  const telephone = phoneOrError(input.telephone);
  if (db.users.some((u) => u.telephone === telephone)) throw reasonError('phone_taken', 409);
  const email = input.email?.trim().toLowerCase() || null;
  if (email && db.users.some((u) => u.email?.toLowerCase() === email)) throw reasonError('email_taken', 409);
  const user: User = {
    id: genId('user'),
    nom: input.nom,
    email,
    telephone,
    phoneVerified: false,
    role: 'principal',
    langue: input.langue,
    twofaEnabled: false,
    emailVerified: false,
    createdAt: new Date().toISOString(),
  };
  mutateDb((d) => {
    d.users.push(user);
    d.passwordsByUser[user.id] = input.password;
  });
  return session(user);
}

export async function login(input: { identifier: string; password: string }) {
  await simulateLatency(300, 700);
  const user = findByIdentifier(input.identifier);
  if (!user || getDb().passwordsByUser[user.id] !== input.password) throw reasonError('invalid_credentials', 401);
  if (user.twofaEnabled) {
    const mfaToken = `mfa_${genId('m')}${Math.random().toString(36).slice(2, 12)}`;
    mfaTokens.set(mfaToken, { userId: user.id, expiresAt: Date.now() + 5 * 60_000 });
    return { twofaRequired: true as const, mfaToken, channels: allowedChannels(user, 'login_2fa') };
  }
  return { twofaRequired: false as const, ...session(user) };
}

export async function refresh(refreshToken: string): Promise<{ accessToken: string }> {
  await simulateLatency(150, 350);
  const userId = userIdFromToken(refreshToken);
  if (!userId) throw reasonError('challenge_invalid', 401);
  return { accessToken: makeToken(userId) };
}

export async function requestOtp(accessToken: string, channel: OtpChannel) {
  await simulateLatency(200, 400);
  const user = findUser(userIdFromToken(accessToken) ?? '');
  ensureAllowed(user, 'phone_verify', channel);
  return { required: true, ...issueChallenge(user.id, 'phone_verify', channel) };
}

export async function verifyOtp(input: { code: string; challengeToken: string | null }): Promise<void> {
  await simulateLatency(300, 600);
  const { userId } = consume(input.challengeToken, input.code, 'phone_verify');
  mutateDb((d) => {
    const target = d.users.find((u) => u.id === userId);
    if (target) target.phoneVerified = true;
  });
}

export async function sendSecondFactor(input: { mfaToken: string; channel: OtpChannel }) {
  await simulateLatency(200, 400);
  const mfa = mfaTokens.get(input.mfaToken);
  if (!mfa || mfa.expiresAt <= Date.now()) throw reasonError('challenge_invalid', 401);
  const user = findUser(mfa.userId);
  ensureAllowed(user, 'login_2fa', input.channel);
  return issueChallenge(user.id, 'login_2fa', input.channel);
}

export async function verifySecondFactor(input: { challengeToken: string; code: string }): Promise<AuthResult> {
  await simulateLatency(300, 600);
  return session(findUser(consume(input.challengeToken, input.code, 'login_2fa').userId));
}

/** Même réponse que le compte existe ou non (le jeton ne mène simplement à rien). */
export async function forgotPassword(input: { identifier: string; channel: OtpChannel }) {
  await simulateLatency(300, 600);
  const user = findByIdentifier(input.identifier);
  const allowed = user && allowedChannels(user, 'password_reset').includes(input.channel);
  const challenge = issueChallenge(allowed ? user.id : null, 'password_reset', input.channel);
  return { ...challenge, channel: null };
}

export async function resetPassword(input: { challengeToken: string; code: string; newPassword: string }): Promise<void> {
  await simulateLatency(300, 600);
  const user = findUser(consume(input.challengeToken, input.code, 'password_reset').userId);
  mutateDb((d) => {
    d.passwordsByUser[user.id] = input.newPassword;
  });
}

function checkPassword(user: User, password: string) {
  if (getDb().passwordsByUser[user.id] !== password) throw reasonError('password_incorrect', 400);
}

export async function changePassword(token: string | null, input: { currentPassword: string; newPassword: string }) {
  await simulateLatency(300, 600);
  const user = findUser(userIdFromToken(token) ?? '');
  checkPassword(user, input.currentPassword);
  mutateDb((d) => {
    d.passwordsByUser[user.id] = input.newPassword;
  });
  return { accessToken: makeToken(user.id), refreshToken: makeToken(user.id) };
}

export async function setTwoFactor(token: string | null, input: { enabled: boolean; password: string }): Promise<User> {
  await simulateLatency(300, 600);
  const user = findUser(userIdFromToken(token) ?? '');
  checkPassword(user, input.password);
  if (input.enabled && allowedChannels(user, 'login_2fa').length === 0) throw reasonError('channel_unavailable', 503);
  mutateDb((d) => {
    const target = d.users.find((u) => u.id === user.id);
    if (target) target.twofaEnabled = input.enabled;
  });
  return withFlags({ ...user, twofaEnabled: input.enabled });
}

/** Changement de numéro, étape 1 : mot de passe, puis code envoyé au NOUVEAU numéro. */
export async function requestPhoneChange(
  token: string | null,
  input: { currentPassword: string; newPhone: string; channel: 'sms' | 'whatsapp' }
) {
  await simulateLatency(300, 600);
  const user = findUser(userIdFromToken(token) ?? '');
  checkPassword(user, input.currentPassword);
  const phone = phoneOrError(input.newPhone);
  if (phone === user.telephone) throw reasonError('phone_unchanged', 409);
  if (getDb().users.some((u) => u.telephone === phone && u.id !== user.id)) throw reasonError('phone_taken', 409);
  return issueChallenge(user.id, 'phone_change', input.channel, phone);
}

export async function confirmPhoneChange(token: string | null, input: { challengeToken: string; code: string }): Promise<User> {
  await simulateLatency(300, 600);
  const user = findUser(userIdFromToken(token) ?? '');
  const challenge = consume(input.challengeToken, input.code, 'phone_change');
  if (challenge.userId !== user.id || !challenge.pendingValue) throw reasonError('challenge_invalid', 400);
  const phone = challenge.pendingValue;
  if (getDb().users.some((u) => u.telephone === phone && u.id !== user.id)) throw reasonError('phone_taken', 409);
  mutateDb((d) => {
    const target = d.users.find((u) => u.id === user.id);
    if (target) Object.assign(target, { telephone: phone, phoneVerified: true });
  });
  return withFlags({ ...user, telephone: phone, phoneVerified: true });
}
