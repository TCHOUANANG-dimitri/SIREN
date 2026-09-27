import { initDb } from '../db';
import { buildSeed, DEMO_IDS } from '../seed';
import { makeToken } from '../helpers';
import * as sharing from '../services/sharingService';
import { ApiError } from '../../errors';

jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  simulateLatency: () => Promise.resolve(),
}));

describe('backend simulé — plafond de 3 proches (CDC App §2)', () => {
  beforeEach(async () => {
    await initDb(buildSeed, true);
  });

  it('refuse un 4ᵉ accès non révoqué, accepte après révocation', async () => {
    const token = makeToken(DEMO_IDS.parentId);
    // Léa a déjà 1 accès actif (Rose) dans le jeu de démonstration.
    await sharing.createShare(token, DEMO_IDS.leaId, { userIdentifier: 'proche2@example.org', permissions: [] });
    const third = await sharing.createShare(token, DEMO_IDS.leaId, { userIdentifier: 'proche3@example.org', permissions: [] });

    await expect(
      sharing.createShare(token, DEMO_IDS.leaId, { userIdentifier: 'proche4@example.org', permissions: [] })
    ).rejects.toMatchObject({ status: 409 });

    await sharing.patchShare(token, third.id, { status: 'revoque' });
    await expect(
      sharing.createShare(token, DEMO_IDS.leaId, { userIdentifier: 'proche4@example.org', permissions: [] })
    ).resolves.toMatchObject({ status: 'invite' });
  });

  it('refuse de réactiver un accès révoqué au-delà du plafond', async () => {
    const token = makeToken(DEMO_IDS.parentId);
    const revoked = await sharing.createShare(token, DEMO_IDS.leaId, { userIdentifier: 'a@example.org', permissions: [] });
    await sharing.patchShare(token, revoked.id, { status: 'revoque' });
    await sharing.createShare(token, DEMO_IDS.leaId, { userIdentifier: 'b@example.org', permissions: [] });
    await sharing.createShare(token, DEMO_IDS.leaId, { userIdentifier: 'c@example.org', permissions: [] });
    const error = await sharing.patchShare(token, revoked.id, { status: 'actif' }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
  });

  it('un secondaire ne peut pas inviter', async () => {
    const token = makeToken(DEMO_IDS.secondaryUserId);
    await expect(
      sharing.createShare(token, DEMO_IDS.leaId, { userIdentifier: 'x@example.org', permissions: [] })
    ).rejects.toMatchObject({ status: 403 });
  });
});
