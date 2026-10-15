import { activeShareCount, checkInvite, normalizeIdentifier, samePhone } from '../inviteRules';
import type { SecondaryAccess } from '@/models/entities';

const me = { email: 'Marie@Example.com', telephone: '+237 6 90 12 34 56' };
const share = (status: SecondaryAccess['status']): SecondaryAccess => ({
  id: Math.random().toString(36),
  childId: 'c1',
  userId: 'u',
  nom: 'x',
  permissions: [],
  status,
  invitedAt: '2026-09-30T00:00:00Z',
});

describe("règles d'invitation", () => {
  it('normalise email et téléphone', () => {
    expect(normalizeIdentifier('  Rose@Example.ORG ')).toEqual({ identifier: 'rose@example.org', kind: 'email' });
    expect(normalizeIdentifier('+237 6 77-22.11 00')).toEqual({ identifier: '+237677221100', kind: 'phone' });
    expect(normalizeIdentifier('rose@')).toMatchObject({ kind: null });
  });

  it('compare les numéros avec ou sans indicatif', () => {
    expect(samePhone('690123456', '+237 6 90 12 34 56')).toBe(true);
    expect(samePhone('690123457', '+237690123456')).toBe(false);
  });

  it.each(['marie@example.com', ' MARIE@EXAMPLE.COM', '690123456', '+237690123456'])('refuse de s’inviter soi-même (%s)', (raw) => {
    expect(checkInvite({ raw, user: me, shares: [] })).toEqual({ ok: false, reason: 'self_invite' });
  });

  it('champ vide, identifiant invalide', () => {
    expect(checkInvite({ raw: '   ', user: me, shares: [] })).toEqual({ ok: false, reason: 'empty' });
    expect(checkInvite({ raw: 'rose', user: me, shares: [] })).toEqual({ ok: false, reason: 'identifier_invalid' });
    expect(checkInvite({ raw: '12345', user: me, shares: [] })).toEqual({ ok: false, reason: 'identifier_invalid' });
  });

  it('plafond de 3 : les révoqués libèrent une place', () => {
    const three = [share('actif'), share('invite'), share('actif')];
    expect(activeShareCount(three)).toBe(3);
    expect(checkInvite({ raw: 'rose@example.org', user: me, shares: three })).toEqual({ ok: false, reason: 'secondary_limit' });
    const withRevoked = [share('actif'), share('invite'), share('revoque')];
    expect(checkInvite({ raw: 'rose@example.org', user: me, shares: withRevoked })).toEqual({ ok: true, identifier: 'rose@example.org', kind: 'email' });
  });
});
