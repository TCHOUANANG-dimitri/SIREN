import { getDb, mutateDb, genId } from '../db';
import { reasonError } from '../../errors';
import { makeToken, simulateLatency, userIdFromToken } from '../helpers';
import type { User } from '@/models/entities';

/**
 * Authentification SIMULÉE (mode démo uniquement, jamais embarquée en live).
 * Mêmes règles que le serveur (codes à usage unique, 5 essais, expiration,
 * pas de session avant le second facteur), mais le code est fixe et affiché à
 * l'écran (`devHint`) : aucun email n'est envoyé.
 */

interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

type Purpose = 'signup_verify' | 'login_2fa' | 'password_reset';

interface MockChallenge {
  userId: string | null;
  purpose: Purpose;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
}

export const DEMO_OTP_CODE = '123456';
const TTL_S = 600;
const MAX_ATTEMPTS = 5;
const challenges = new Map<string, MockChallenge>();

function issueChallenge(userId: string | null, purpose: Purpose) {
  for (const c of challenges.values()) if (c.userId === userId && c.purpose === purpose) c.consumed = true;
  const token = `${genId('chal')}${Math.random().toString(36).slice(2, 12)}`;
  challenges.set(token, { userId, purpose, expiresAt: Date.now() + TTL_S * 1000, attempts: 0, consumed: false });
  return { challengeToken: token, expiresIn: TTL_S, devHint: DEMO_OTP_CODE };
}

function consume(token: string | null, code: string, purpose: Purpose): string {
  const c = token ? challenges.get(token) : undefined;
  if (!c || c.purpose !== purpose) throw reasonError('challenge_invalid', 400);
  if (c.consumed || c.expiresAt <= Date.now()) throw reasonError('otp_expired', 400);
  if (c.attempts >= MAX_ATTEMPTS) throw reasonError('otp_attempts_exceeded', 429);
  if (code.trim() !== DEMO_OTP_CODE) {
    c.attempts += 1;
    throw reasonError('otp_invalid', 400);
  }
  if (!c.userId) throw reasonError('otp_invalid', 400);
  c.consumed = true;
  return c.userId;
}

function session(user: User): AuthResult {
  return { user, accessToken: makeToken(user.id), refreshToken: makeToken(user.id) };
}

function findUser(userId: string): User {
  const user = getDb().users.find((u) => u.id === userId);
  if (!user) throw reasonError('challenge_invalid', 401);
  return user;
}

export async function register(input: {
  nom: string;
  email: string;
  telephone?: string;
  password: string;
  langue: 'fr' | 'en';
}): Promise<AuthResult> {
  await simulateLatency(300, 700);
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  if (db.users.some((u) => u.email.toLowerCase() === email)) throw reasonError('email_taken', 409);
  const user: User = {
    id: genId('user'),
    nom: input.nom,
    email,
    telephone: input.telephone,
    role: 'principal',
    langue: input.langue,
    twofaEnabled: false,
    emailVerified: false,
    createdAt: new Date().toISOString(),
  };
  mutateDb((d) => {
    d.users.push(user);
    d.passwordsByEmail[email] = input.password;
  });
  return session(user);
}

export async function login(input: { email: string; password: string }) {
  await simulateLatency(300, 700);
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const user = db.users.find((u) => u.email.toLowerCase() === email);
  if (!user || db.passwordsByEmail[email] !== input.password) throw reasonError('invalid_credentials', 401);
  if (user.twofaEnabled) return { twofaRequired: true as const, ...issueChallenge(user.id, 'login_2fa') };
  return { twofaRequired: false as const, ...session(user) };
}

export async function refresh(refreshToken: string): Promise<{ accessToken: string }> {
  await simulateLatency(150, 350);
  const userId = userIdFromToken(refreshToken);
  if (!userId) throw reasonError('challenge_invalid', 401);
  return { accessToken: makeToken(userId) };
}

export async function requestOtp(accessToken: string) {
  await simulateLatency(200, 400);
  return { required: true, ...issueChallenge(userIdFromToken(accessToken), 'signup_verify') };
}

export async function verifyOtp(input: { code: string; challengeToken: string | null }): Promise<void> {
  await simulateLatency(300, 600);
  const userId = consume(input.challengeToken, input.code, 'signup_verify');
  mutateDb((d) => {
    const target = d.users.find((u) => u.id === userId);
    if (target) target.emailVerified = true;
  });
}

export async function verifySecondFactor(input: { challengeToken: string; code: string }): Promise<AuthResult> {
  await simulateLatency(300, 600);
  return session(findUser(consume(input.challengeToken, input.code, 'login_2fa')));
}

export async function resendSecondFactor(challengeToken: string) {
  await simulateLatency(200, 400);
  const c = challenges.get(challengeToken);
  if (!c || c.purpose !== 'login_2fa') throw reasonError('challenge_invalid', 400);
  return issueChallenge(c.userId, 'login_2fa');
}

/** Même réponse que le compte existe ou non (le jeton ne mène simplement à rien). */
export async function forgotPassword(email: string) {
  await simulateLatency(300, 600);
  const user = getDb().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  return issueChallenge(user?.id ?? null, 'password_reset');
}

export async function resetPassword(input: { challengeToken: string; code: string; newPassword: string }): Promise<void> {
  await simulateLatency(300, 600);
  const user = findUser(consume(input.challengeToken, input.code, 'password_reset'));
  mutateDb((d) => {
    d.passwordsByEmail[user.email.toLowerCase()] = input.newPassword;
  });
}

export async function changePassword(token: string | null, input: { currentPassword: string; newPassword: string }) {
  await simulateLatency(300, 600);
  const user = findUser(userIdFromToken(token) ?? '');
  const key = user.email.toLowerCase();
  if (getDb().passwordsByEmail[key] !== input.currentPassword) throw reasonError('password_incorrect', 400);
  mutateDb((d) => {
    d.passwordsByEmail[key] = input.newPassword;
  });
  return { accessToken: makeToken(user.id), refreshToken: makeToken(user.id) };
}

export async function setTwoFactor(token: string | null, input: { enabled: boolean; password: string }): Promise<User> {
  await simulateLatency(300, 600);
  const user = findUser(userIdFromToken(token) ?? '');
  if (getDb().passwordsByEmail[user.email.toLowerCase()] !== input.password) throw reasonError('password_incorrect', 400);
  mutateDb((d) => {
    const target = d.users.find((u) => u.id === user.id);
    if (target) target.twofaEnabled = input.enabled;
  });
  return { ...user, twofaEnabled: input.enabled };
}
