import { env } from '@/config/env';
import type { SirenApi } from './repositories';

/**
 * Sélection unique de la source de données. Le backend simulé n'est évalué
 * qu'en mode mock ; en build live il n'est même pas embarqué (metro.config.js).
 */
export const api: SirenApi =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  env.apiMode === 'mock' ? require('./mock/entry').mockApi : require('./live').liveApi;

export type { SirenApi } from './repositories';
