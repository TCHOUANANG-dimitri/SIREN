import { isPhoneFixStale, permissionStateFrom, PHONE_FIX_MAX_AGE_MS } from '../phoneLocation';

describe('position du téléphone : états d’autorisation', () => {
  it.each([
    [{ status: 'undetermined', canAskAgain: true }, true, 'unknown'],
    [{ status: 'granted', canAskAgain: true }, true, 'granted'],
    [{ status: 'granted', canAskAgain: true }, false, 'services_off'],
    [{ status: 'denied', canAskAgain: true }, true, 'denied'],
    [{ status: 'denied', canAskAgain: false }, true, 'blocked'],
  ])('%j / services %s → %s', (permission, services, expected) => {
    expect(permissionStateFrom(permission, services)).toBe(expected);
  });

  it('un relevé ancien n’est jamais présenté comme actuel', () => {
    const now = 1_000_000_000;
    expect(isPhoneFixStale(now - PHONE_FIX_MAX_AGE_MS - 1, now)).toBe(true);
    expect(isPhoneFixStale(now - 1000, now)).toBe(false);
  });
});
