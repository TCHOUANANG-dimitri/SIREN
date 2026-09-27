import { parseNotificationData } from '../notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: {},
  AndroidNotificationVisibility: {},
  AndroidNotificationPriority: {},
}));

describe('charge utile de notification', () => {
  it('format serveur v1 (snake_case)', () => {
    expect(parseNotificationData({ child_id: 'c-1', alert_id: 'a_2', level: 'urgence', score: '82' })).toEqual({
      childId: 'c-1',
      alertId: 'a_2',
      level: 'urgence',
    });
  });
  it('format mock (camelCase)', () => {
    expect(parseNotificationData({ childId: 'c1', alertId: 'a1', level: 'prealerte' })?.level).toBe('prealerte');
  });
  it('niveau absent ou inconnu → information', () => {
    expect(parseNotificationData({ childId: 'c1', level: 'autre' })?.level).toBe('information');
  });
  it('rejette un identifiant forgé (injection de route)', () => {
    expect(parseNotificationData({ childId: '../(main)/settings' })).toBeNull();
    expect(parseNotificationData({ childId: 'c1', alertId: 'a1?x=1' })).toBeNull();
    expect(parseNotificationData(null)).toBeNull();
    expect(parseNotificationData({})).toBeNull();
  });
});
