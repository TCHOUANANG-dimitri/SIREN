import type { RiskState } from '@/models/entities';

/**
 * Réimplémentation TypeScript fidèle du moteur de fusion — CDC_2_Serveur.docx §5.4.
 * Formule vérifiée textuellement dans le document (poids, bonus de concordance,
 * amplification contextuelle, seuils 30/70).
 */
export interface SubScoresInput {
  sUniversel: number; // 0..1
  sDeclaratif: number; // 0..1
  sGeo: number; // 0..1, avant atténuation par la confiance
  sMouvement: number; // 0..1
  confidence: number; // 0..100 — maturité du modèle (couche 3)
  contexteNuit: boolean;
  horsPerimetre: boolean;
}

export interface FusionResult {
  score: number; // 0..100
  sGeoEff: number;
  concordanceBonusApplied: boolean;
  contextAmplificationApplied: boolean;
}

const W_UNIV = 0.35;
const W_DECL = 0.3;
const W_GEO = 0.2;
const W_MOUV = 0.15;

export function computeFusionScore(input: SubScoresInput): FusionResult {
  const conf = Math.max(0, Math.min(100, input.confidence)) / 100;
  const sGeoEff = input.sGeo * conf;

  let base =
    W_UNIV * input.sUniversel + W_DECL * input.sDeclaratif + W_GEO * sGeoEff + W_MOUV * input.sMouvement;

  const activeSignals = [input.sUniversel, input.sDeclaratif, sGeoEff, input.sMouvement].filter(
    (x) => x >= 0.6
  ).length;
  const concordanceBonusApplied = activeSignals >= 2;
  if (concordanceBonusApplied) base = Math.min(1, base * 1.25);

  const contextAmplificationApplied = input.contexteNuit || input.horsPerimetre;
  if (contextAmplificationApplied) base = Math.min(1, base * 1.15);

  return {
    score: Math.round(base * 100),
    sGeoEff,
    concordanceBonusApplied,
    contextAmplificationApplied,
  };
}

export function stateFromScore(score: number): Exclude<RiskState, 'disparition'> {
  if (score >= 70) return 'urgence';
  if (score >= 30) return 'prealerte';
  return 'veille';
}

const RANK: Record<RiskState, number> = { veille: 0, prealerte: 1, urgence: 2, disparition: 3 };

/**
 * Hystérésis : au moins deux mesures consécutives doivent confirmer un changement
 * d'état, et une désescalade exige de redescendre nettement sous le seuil, pour
 * éviter le "clignotement" — CDC2 §5.4.
 */
export class HysteresisGate {
  private buffer: Exclude<RiskState, 'disparition'>[] = [];
  private confirmed: Exclude<RiskState, 'disparition'> = 'veille';

  constructor(initial: Exclude<RiskState, 'disparition'> = 'veille') {
    this.confirmed = initial;
  }

  get currentState() {
    return this.confirmed;
  }

  update(rawState: Exclude<RiskState, 'disparition'>, score: number): Exclude<RiskState, 'disparition'> {
    this.buffer.push(rawState);
    if (this.buffer.length > 2) this.buffer.shift();

    const escalation = RANK[rawState] > RANK[this.confirmed];
    const deescalation = RANK[rawState] < RANK[this.confirmed];
    const twoConsecutive = this.buffer.length === 2 && this.buffer[0] === this.buffer[1] && this.buffer[1] === rawState;

    if (escalation && twoConsecutive) {
      this.confirmed = rawState;
    } else if (deescalation && twoConsecutive) {
      const clearMargin =
        this.confirmed === 'urgence' ? score < 60 : this.confirmed === 'prealerte' ? score < 25 : true;
      if (clearMargin) this.confirmed = rawState;
    }
    return this.confirmed;
  }

  reset(state: Exclude<RiskState, 'disparition'> = 'veille') {
    this.confirmed = state;
    this.buffer = [];
  }
}
