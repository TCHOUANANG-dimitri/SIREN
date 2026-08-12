"""
Moteur de fusion du score de risque (section 5.4 du CDC).

Sous-scores normalisés 0-1 → fusion pondérée → score global 0-100.
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class SubScores:
    universel: float = 0.0
    declaratif: float = 0.0
    geo: float = 0.0
    mouvement: float = 0.0


@dataclass
class FusionResult:
    score: int
    state: str
    reasons: List[str]
    sub_scores: dict


# Poids de base (CDC section 5.4)
W_UNIV = 0.35
W_DECL = 0.30
W_GEO = 0.20
W_MOUV = 0.15

# Seuils (CDC section 5.4)
THRESHOLD_PREALERTE = 30
THRESHOLD_URGENCE = 70

# Seuil de concordance
CONCORDANCE_THRESHOLD = 0.6
NB_ACTIF_MIN = 2
CONCORDANCE_BONUS = 1.25

# Amplification contextuelle
CONTEXT_BONUS = 1.15


def compute_fusion(
    sub: SubScores,
    model_confidence: float = 1.0,
    contexte_nuit: bool = False,
    hors_perimetre: bool = False,
    previous_state: Optional[str] = None,
) -> FusionResult:
    reasons = []

    # Sous-score géographique atténué par la confiance du modèle
    s_geo_eff = sub.geo * model_confidence

    # Combinaison pondérée
    base = W_UNIV * sub.universel + W_DECL * sub.declaratif + W_GEO * s_geo_eff + W_MOUV * sub.mouvement

    # Règle de concordance
    actifs = sum(1 for x in [sub.universel, sub.declaratif, s_geo_eff, sub.mouvement] if x >= CONCORDANCE_THRESHOLD)
    if actifs >= NB_ACTIF_MIN:
        base = min(1.0, base * CONCORDANCE_BONUS)
        reasons.append(f"concordance:{actifs} signaux actifs")

    # Contexte
    if contexte_nuit:
        base = min(1.0, base * CONTEXT_BONUS)
        reasons.append("contexte:nuit")
    if hors_perimetre:
        base = min(1.0, base * CONTEXT_BONUS)
        reasons.append("contexte:hors_perimetre")

    score = round(base * 100)

    # Hystérésis : vérifier les mesures consécutives
    state = _determine_state(score, previous_state)

    return FusionResult(
        score=score,
        state=state,
        reasons=reasons,
        sub_scores={
            "universel": round(sub.universel * 100),
            "declaratif": round(sub.declaratif * 100),
            "geo": round(sub.geo * 100),
            "mouvement": round(sub.mouvement * 100),
        },
    )


def _determine_state(score: int, previous_state: Optional[str]) -> str:
    if previous_state == "disparition":
        return "disparition"

    if previous_state == "urgence":
        if score >= THRESHOLD_PREALERTE:
            return "urgence"
        return "veille"

    if previous_state == "prealerte":
        if score >= THRESHOLD_URGENCE:
            return "urgence"
        if score < THRESHOLD_PREALERTE:
            return "veille"
        return "prealerte"

    if score >= THRESHOLD_URGENCE:
        return "urgence"
    if score >= THRESHOLD_PREALERTE:
        return "prealerte"

    return "veille"
