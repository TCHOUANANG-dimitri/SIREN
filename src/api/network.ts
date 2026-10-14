import { env } from '@/config/env';

/** Point de bascule unique mock/live. */
export function isMockMode(): boolean {
  return env.apiMode === 'mock';
}

export { ApiError } from './errors';
