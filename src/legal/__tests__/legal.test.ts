import { legalEn } from '../content/en';
import { legalFr } from '../content/fr';
import { acceptanceVersions, LEGAL_DOCUMENTS, legalContent } from '../registry';

describe('documents juridiques', () => {
  it('chaque document existe en FR et en EN, avec la même structure', () => {
    for (const meta of LEGAL_DOCUMENTS) {
      const fr = legalFr[meta.id];
      const en = legalEn[meta.id];
      expect(fr.sections.length).toBe(en.sections.length);
      fr.sections.forEach((section, i) => expect(section.paragraphs.length).toBe(en.sections[i].paragraphs.length));
    }
  });

  it('versions et dates valides ; aucun document présenté comme validé sans décision', () => {
    for (const meta of LEGAL_DOCUMENTS) {
      expect(meta.version).toMatch(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/);
      expect(Number.isNaN(Date.parse(meta.effectiveAt))).toBe(false);
      expect(meta.status).toBe('draft');
    }
  });

  it("n'invente aucune coordonnée : ni email, ni téléphone, ni URL, ni numéro d'immatriculation", () => {
    const all = JSON.stringify([legalFr, legalEn]);
    expect(all).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(all).not.toMatch(/https?:\/\//);
    expect(all).not.toMatch(/\+\d{3}[\s\d]{6,}/);
    expect(all).not.toMatch(/RC\/[A-Z]{3}\//);
    // Les informations inconnues sont signalées explicitement.
    expect(all).toContain('[À COMPLÉTER');
    expect(all).toContain('[TO BE COMPLETED');
  });

  it('ne mélange pas les langues et retombe sur le français', () => {
    expect(legalContent('privacy', 'en').title).toBe('Privacy policy');
    expect(legalContent('privacy', 'de').title).toBe('Politique de confidentialité');
    expect(JSON.stringify(legalEn)).not.toContain('À COMPLÉTER');
    expect(JSON.stringify(legalFr)).not.toContain('TO BE COMPLETED');
  });

  it("transmet les versions acceptées à l'inscription", () => {
    expect(acceptanceVersions()).toEqual({ acceptedTermsVersion: expect.any(String), acceptedPrivacyVersion: expect.any(String) });
  });
});
