import { initDb, resetDb } from './db';
import { buildSeed } from './seed';
import { startScenarioEngine, resetScenarioEngine } from './scenarioEngine';

let started = false;

export async function initMockBackend(): Promise<void> {
  if (started) return;
  await initDb(buildSeed);
  startScenarioEngine();
  started = true;
}

/** Action "Réinitialiser la démo" (Réglages). */
export async function resetMockBackend(): Promise<void> {
  await resetDb(buildSeed);
  resetScenarioEngine();
  started = true;
}
