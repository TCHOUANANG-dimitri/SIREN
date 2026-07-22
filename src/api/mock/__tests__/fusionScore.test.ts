import { computeFusionScore, stateFromScore, HysteresisGate } from '../fusionScore';

describe('computeFusionScore — CDC2 §5.4', () => {
  it('produit un score bas en veille (routine normale, confiance faible)', () => {
    const result = computeFusionScore({
      sUniversel: 0.1,
      sDeclaratif: 0,
      sGeo: 0.2,
      sMouvement: 0.1,
      confidence: 20,
      contexteNuit: false,
      horsPerimetre: false,
    });
    expect(result.score).toBeLessThan(30);
    expect(stateFromScore(result.score)).toBe('veille');
  });

  it('applique le bonus de concordance quand >= 2 signaux dépassent 0.6', () => {
    const withoutConcordance = computeFusionScore({
      sUniversel: 0.65,
      sDeclaratif: 0,
      sGeo: 0,
      sMouvement: 0,
      confidence: 100,
      contexteNuit: false,
      horsPerimetre: false,
    });
    const withConcordance = computeFusionScore({
      sUniversel: 0.65,
      sDeclaratif: 0.65,
      sGeo: 0,
      sMouvement: 0,
      confidence: 100,
      contexteNuit: false,
      horsPerimetre: false,
    });
    expect(withConcordance.concordanceBonusApplied).toBe(true);
    expect(withoutConcordance.concordanceBonusApplied).toBe(false);
  });

  it('amplifie le score en contexte nuit ou hors périmètre', () => {
    const base = { sUniversel: 0.5, sDeclaratif: 0.3, sGeo: 0.4, sMouvement: 0.2, confidence: 80 };
    const normal = computeFusionScore({ ...base, contexteNuit: false, horsPerimetre: false });
    const nightAmplified = computeFusionScore({ ...base, contexteNuit: true, horsPerimetre: false });
    expect(nightAmplified.score).toBeGreaterThan(normal.score);
    expect(nightAmplified.contextAmplificationApplied).toBe(true);
  });

  it('atténue le sous-score géographique par la confiance du modèle', () => {
    const lowConfidence = computeFusionScore({
      sUniversel: 0,
      sDeclaratif: 0,
      sGeo: 1,
      sMouvement: 0,
      confidence: 10,
      contexteNuit: false,
      horsPerimetre: false,
    });
    const highConfidence = computeFusionScore({
      sUniversel: 0,
      sDeclaratif: 0,
      sGeo: 1,
      sMouvement: 0,
      confidence: 100,
      contexteNuit: false,
      horsPerimetre: false,
    });
    expect(highConfidence.sGeoEff).toBeGreaterThan(lowConfidence.sGeoEff);
    expect(highConfidence.score).toBeGreaterThan(lowConfidence.score);
  });

  it('franchit le seuil urgence pour un scénario vitesse véhicule + hors périmètre + nuit', () => {
    const result = computeFusionScore({
      sUniversel: 0.85,
      sDeclaratif: 0.9,
      sGeo: 0.9,
      sMouvement: 0.3,
      confidence: 70,
      contexteNuit: true,
      horsPerimetre: true,
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(stateFromScore(result.score)).toBe('urgence');
  });

  it('ne dépasse jamais 100', () => {
    const result = computeFusionScore({
      sUniversel: 1,
      sDeclaratif: 1,
      sGeo: 1,
      sMouvement: 1,
      confidence: 100,
      contexteNuit: true,
      horsPerimetre: true,
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('stateFromScore — seuils 30/70', () => {
  it.each([
    [0, 'veille'],
    [29, 'veille'],
    [30, 'prealerte'],
    [69, 'prealerte'],
    [70, 'urgence'],
    [100, 'urgence'],
  ] as const)('score %i -> %s', (score, expected) => {
    expect(stateFromScore(score)).toBe(expected);
  });
});

describe('HysteresisGate — anti-clignotement', () => {
  it("n'escalade pas sur une seule mesure au-dessus du seuil", () => {
    const gate = new HysteresisGate('veille');
    const result = gate.update('prealerte', 35);
    expect(result).toBe('veille');
  });

  it('escalade après deux mesures consécutives confirmant le nouvel état', () => {
    const gate = new HysteresisGate('veille');
    gate.update('prealerte', 35);
    const result = gate.update('prealerte', 36);
    expect(result).toBe('prealerte');
  });

  it('ne désescalade pas sans redescendre nettement sous le seuil', () => {
    const gate = new HysteresisGate('urgence');
    gate.update('prealerte', 62);
    const result = gate.update('prealerte', 62);
    // 62 < 70 mais pas < 60 (marge nette exigée pour quitter 'urgence') -> reste urgence
    expect(result).toBe('urgence');
  });

  it('désescalade quand le score redescend nettement et se confirme deux fois', () => {
    const gate = new HysteresisGate('urgence');
    gate.update('prealerte', 40);
    const result = gate.update('prealerte', 38);
    expect(result).toBe('prealerte');
  });
});
