import { env } from '@/config/env';

/**
 * Point de bascule unique mock/live — CDC1 §4.3, §15. Les services de src/api/services/*
 * appellent toujours ces helpers ; aucune feature ne sait si elle parle à un mock.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function isMockMode(): boolean {
  return env.apiMode === 'mock';
}

export async function simulateLatency(minMs = 200, maxMs = 600): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

export function makeToken(userId: string): string {
  return `tok_${userId}__${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function userIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const match = token.match(/^tok_(.+?)__[0-9a-z]+$/);
  return match?.[1] ?? null;
}
