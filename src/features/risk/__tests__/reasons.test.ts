import i18n from '@/i18n';
import { explainReason, reasonLabel, zoneNamesOf } from '../reasons';

const t = i18n.t.bind(i18n);

/** Codes émis par le serveur (rules/declarative.py, rules/universal.py, fusion_score.py). */
const SERVER_REASONS = [
  'zone_interdite:g1',
  'hors_perimetre:g2,g3',
  'hors_horaire_attendu',
  'vitesse_critique:95km/h',
  'vitesse_elevee:62km/h',
  'signal_perdu',
  'precision_degradee:640m',
  'choc_critique:6.1m/s2',
  'choc_modere:3.4m/s2',
  'ecart_soudain:2400m/60s',
  'concordance:3 signaux actifs',
  'contexte:nuit',
  'contexte:hors_perimetre',
];

describe('raisons du score', () => {
  beforeAll(() => i18n.changeLanguage('fr'));
  afterAll(() => i18n.changeLanguage('fr'));

  it.each(SERVER_REASONS)('« %s » est expliquée, sans code brut', (reason) => {
    const explained = explainReason(t, reason);
    expect(explained).not.toBeNull();
    expect(explained!.label).not.toMatch(/[a-z]+_[a-z]+/);
    expect(explained!.label).not.toContain('{{');
    expect(explained!.detail.length).toBeGreaterThan(10);
  });

  it('nomme le lieu interdit ou le périmètre quitté quand il est connu', () => {
    const zoneNames = zoneNamesOf([
      { id: 'g1', nom: 'Chantier' },
      { id: 'g2', nom: 'Quartier' },
    ]);
    expect(explainReason(t, 'zone_interdite:g1', { zoneNames })!.label).toContain('Chantier');
    expect(explainReason(t, 'hors_perimetre:g2,g3', { zoneNames })!.label).toContain('Quartier');
  });

  it('reprend les valeurs mesurées', () => {
    expect(explainReason(t, 'vitesse_critique:95km/h')!.label).toContain('95');
    expect(explainReason(t, 'precision_degradee:640m')!.label).toContain('640');
  });

  it('suit la langue', async () => {
    await i18n.changeLanguage('en');
    expect(explainReason(t, 'signal_perdu')!.label).toBe('GPS signal lost');
    await i18n.changeLanguage('fr');
  });

  it('code inconnu : libellé générique ; texte libre lisible : affiché tel quel', () => {
    expect(reasonLabel(t, 'nouveau_detecteur:42')).toBe(t('risk.reason.unknown'));
    expect(reasonLabel(t, 'Comportement inhabituel')).toBe('Comportement inhabituel');
  });
});
