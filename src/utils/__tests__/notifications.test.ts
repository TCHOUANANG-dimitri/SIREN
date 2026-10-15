import i18n from '@/i18n';
import { notificationContent, parseNotificationData, shouldDisplay } from '../notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: {},
  AndroidNotificationVisibility: {},
  AndroidNotificationPriority: {},
}));

describe('charge utile de notification', () => {
  it('format serveur v1 (snake_case, sans type)', () => {
    expect(parseNotificationData({ child_id: 'c-1', alert_id: 'a_2', level: 'urgence', score: '82' })).toEqual({
      kind: 'urgence',
      childId: 'c-1',
      alertId: 'a_2',
      level: 'urgence',
    });
  });
  it('format v1 structuré (type + clés de traduction)', () => {
    const data = { v: '1', type: 'low_battery', titleKey: 'notifications.push.low_battery.title', childId: 'c1', vars: '{"child":"Léa"}' };
    expect(parseNotificationData(data)).toEqual({ kind: 'low_battery', childId: 'c1', alertId: undefined, level: 'information' });
  });
  it('format mock (camelCase)', () => {
    expect(parseNotificationData({ childId: 'c1', alertId: 'a1', level: 'prealerte' })?.level).toBe('prealerte');
  });
  it('niveau absent ou inconnu → information, type inconnu → unknown', () => {
    expect(parseNotificationData({ childId: 'c1', level: 'autre', type: 'pirate' })).toMatchObject({ level: 'information', kind: 'unknown' });
  });
  it('rejette un identifiant forgé (injection de route)', () => {
    expect(parseNotificationData({ childId: '../(main)/settings' })).toBeNull();
    expect(parseNotificationData({ childId: 'c1', alertId: 'a1?x=1' })).toBeNull();
    expect(parseNotificationData(null)).toBeNull();
    expect(parseNotificationData({})).toBeNull();
  });
});

describe('préférences d’affichage', () => {
  const off = { prealerte: false, information: false };
  it("n'empêche jamais l'affichage d'une urgence", () => {
    expect(shouldDisplay({ childId: 'c1', type: 'urgence', level: 'urgence' }, off)).toBe(true);
  });
  it('respecte les choix pour pré-alertes et informations', () => {
    expect(shouldDisplay({ childId: 'c1', level: 'prealerte' }, off)).toBe(false);
    expect(shouldDisplay({ childId: 'c1', type: 'low_battery' }, off)).toBe(false);
    expect(shouldDisplay({ childId: 'c1', type: 'low_battery' }, { prealerte: false, information: true })).toBe(true);
  });
});

describe('contenu traduit', () => {
  afterAll(() => i18n.changeLanguage('fr'));
  it('suit la langue courante, avec les variables', async () => {
    await i18n.changeLanguage('en');
    expect(notificationContent('urgence', { child: 'Léa' }).title).toBe('Emergency — Léa');
    await i18n.changeLanguage('fr');
    expect(notificationContent('urgence', { child: 'Léa' }).title).toBe('Urgence — Léa');
    expect(notificationContent('share_invite', { inviter: 'Marie', child: 'Léa' }).body).toContain('Marie');
  });
});
