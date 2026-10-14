import { getDb, mutateDb, genId } from '../db';
import { simulateLatency } from '../helpers';
import { resolveCurrentUser } from '../session';
import type { CommunityReport } from '@/models/entities';

export async function listCommunityReports(token: string | null): Promise<CommunityReport[]> {
  await simulateLatency();
  resolveCurrentUser(token);
  return getDb()
    .communityReports.slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createCommunityReport(
  token: string | null,
  input: { description: string; lat: number; lon: number }
): Promise<CommunityReport> {
  await simulateLatency(300, 700);
  const user = resolveCurrentUser(token);
  const report: CommunityReport = {
    id: genId('report'),
    description: input.description,
    lat: input.lat,
    lon: input.lon,
    createdAt: new Date().toISOString(),
    authorNom: user.nom,
  };
  mutateDb((d) => {
    d.communityReports.unshift(report);
  });
  return report;
}
