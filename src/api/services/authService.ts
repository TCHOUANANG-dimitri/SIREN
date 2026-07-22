import { getDb, mutateDb, genId } from '../mock/db';
import { ApiError, makeToken, simulateLatency } from '../network';
import type { User } from '@/models/entities';

interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

const OTP_CODE = '123456'; // code fixe en mode démo, affiché à l'écran pour faciliter les tests

export async function register(input: {
  nom: string;
  email: string;
  telephone?: string;
  password: string;
}): Promise<AuthResult> {
  await simulateLatency(300, 700);
  const db = getDb();
  if (db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    throw new ApiError('Cet email est déjà utilisé', 409);
  }
  const user: User = {
    id: genId('user'),
    nom: input.nom,
    email: input.email,
    telephone: input.telephone,
    role: 'principal',
    langue: 'fr',
    createdAt: new Date().toISOString(),
  };
  mutateDb((d) => {
    d.users.push(user);
    d.passwordsByEmail[input.email.toLowerCase()] = input.password;
  });
  return { user, accessToken: makeToken(user.id), refreshToken: makeToken(user.id) };
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  await simulateLatency(300, 700);
  const db = getDb();
  const user = db.users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
  const expectedPassword = db.passwordsByEmail[input.email.toLowerCase()];
  if (!user || expectedPassword !== input.password) {
    throw new ApiError('Identifiants incorrects', 401);
  }
  return { user, accessToken: makeToken(user.id), refreshToken: makeToken(user.id) };
}

export async function refresh(refreshToken: string): Promise<{ accessToken: string }> {
  await simulateLatency(150, 350);
  const match = refreshToken.match(/^tok_(.+?)__/);
  if (!match) throw new ApiError('Jeton invalide', 401);
  return { accessToken: makeToken(match[1]) };
}

export async function requestOtp(): Promise<{ devHint: string }> {
  await simulateLatency(200, 400);
  return { devHint: OTP_CODE };
}

export async function verifyOtp(code: string, pending: AuthResult): Promise<AuthResult> {
  await simulateLatency(300, 600);
  if (code !== OTP_CODE) throw new ApiError('Code incorrect ou expiré', 401);
  return pending;
}

export async function forgotPassword(_email: string): Promise<{ sent: boolean }> {
  await simulateLatency(300, 600);
  return { sent: true };
}
