import { initDb, mutateDb } from '../db';
import { buildSeed, DEMO_IDS } from '../seed';
import { makeToken } from '../helpers';
import * as sharing from '../services/sharingService';
import { ApiError } from '../../errors';

jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  simulateLatency: () => Promise.resolve(),
}));

/** Comptes fictifs (jamais de données réelles) : comme le serveur, le mock exige un compte existant. */
function addUser(email: string, telephone?: string) {
  mutateDb((d) => {
    d.users.push({ id: `u-${email}`, nom: email.split('@')[0], email, telephone, role: 'principal', langue: 'fr', createdAt: new Date().toISOString() });
  });
}

describe('backend simulé — règles de partage (mêmes que le serveur)', () => {
  const parent = () => makeToken(DEMO_IDS.parentId);

  beforeEach(async () => {
    await initDb(buildSeed, true);
    ['proche2@example.org', 'proche3@example.org', 'proche4@example.org', 'a@example.org', 'b@example.org', 'c@example.org'].forEach((e) => addUser(e));
  });

  it('refuse un 4ᵉ accès non révoqué, accepte après révocation', async () => {
    // Léa a déjà 1 accès actif (Rose) dans le jeu de démonstration.
    await sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'proche2@example.org', permissions: [] });
    const third = await sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'proche3@example.org', permissions: [] });

    await expect(
      sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'proche4@example.org', permissions: [] })
    ).rejects.toMatchObject({ status: 409, reason: 'secondary_limit' });

    await sharing.patchShare(parent(), third.id, { status: 'revoque' });
    await expect(
      sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'proche4@example.org', permissions: [] })
    ).resolves.toMatchObject({ status: 'invite' });
  });

  it('refuse de réactiver un accès révoqué au-delà du plafond', async () => {
    const revoked = await sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'a@example.org', permissions: [] });
    await sharing.patchShare(parent(), revoked.id, { status: 'revoque' });
    await sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'b@example.org', permissions: [] });
    await sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'c@example.org', permissions: [] });
    const error = await sharing.patchShare(parent(), revoked.id, { status: 'actif' }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
  });

  it('un secondaire ne peut pas inviter', async () => {
    await expect(
      sharing.createShare(makeToken(DEMO_IDS.secondaryUserId), DEMO_IDS.leaId, { userIdentifier: 'a@example.org', permissions: [] })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuse l'auto-invitation, quelle que soit la casse", async () => {
    await expect(
      sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: '  MARIE@example.com ', permissions: [] })
    ).rejects.toMatchObject({ status: 422, reason: 'self_invite' });
  });

  it("refuse l'auto-invitation par téléphone, avec ou sans indicatif", async () => {
    await expect(
      sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: '690123456', permissions: [] })
    ).rejects.toMatchObject({ reason: 'self_invite' });
  });

  it('distingue identifiant invalide, compte inexistant et doublon', async () => {
    await expect(sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'pas-un-email', permissions: [] })).rejects.toMatchObject({
      reason: 'identifier_invalid',
    });
    await expect(sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'inconnu@example.org', permissions: [] })).rejects.toMatchObject({
      status: 404,
      reason: 'invitee_not_found',
    });
    await sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'a@example.org', permissions: [] });
    await expect(sharing.createShare(parent(), DEMO_IDS.leaId, { userIdentifier: 'A@example.org', permissions: [] })).rejects.toMatchObject({
      status: 409,
      reason: 'already_shared',
    });
  });
});
