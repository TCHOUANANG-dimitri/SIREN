"""
Couche 2 — Détecteurs universels (signaux extrêmes, sans historique).

Implémente la spécification validée en semaine 1 (tâche "Définir les seuils
des détecteurs universels"). Voir le livrable complet :
Documentation/IA_S1_Tableau_Seuils_Universels.md

Les valeurs ci-dessous sont des POINTS DE DÉPART. Elles doivent être
recalibrées en semaine 2, une fois les jeux de données simulées
disponibles (tâche "Tester le pipeline sur données simulées").
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from app.rules.geo import Point, distance_m

# --- Vitesse (km/h), calculée depuis la télémétrie du dispositif ---
SPEED_WARNING_KMH = 50.0
SPEED_WARNING_SCORE = 0.3
SPEED_CRITICAL_KMH = 80.0
SPEED_CRITICAL_SCORE = 0.7

# --- Perte de signal : binaire (fix_quality == "perdu") ---
SIGNAL_LOST_SCORE = 0.6

# --- Précision GPS dégradée (mètres) ---
ACCURACY_DEGRADED_M = 500.0
ACCURACY_DEGRADED_SCORE = 0.3

# --- Choc / IMU : accMax en m/s² ---
SHOCK_WARNING_MS2 = 3.0
SHOCK_WARNING_SCORE = 0.4
SHOCK_CRITICAL_MS2 = 5.0
SHOCK_CRITICAL_SCORE = 0.8

# --- Écart soudain entre deux positions consécutives ---
# Détecte un transport anormal (ex. enlèvement en véhicule) même en
# l'absence de toute zone déclarée par le parent. Valeur proposée, à
# valider sur les scénarios de test de la semaine 2.
SUDDEN_JUMP_DISTANCE_M = 2000.0
SUDDEN_JUMP_MAX_SECONDS = 120.0
SUDDEN_JUMP_SCORE = 0.6


@dataclass
class TelemetryPoint:
    position: Point
    ts: datetime
    speed_kmh: Optional[float] = None
    accuracy_m: Optional[float] = None
    fix_quality: Optional[str] = None
    acc_max_ms2: Optional[float] = None


@dataclass
class UniversalResult:
    score: float
    reasons: List[str]


def evaluate_universal(
    current: TelemetryPoint, previous: Optional[TelemetryPoint] = None
) -> UniversalResult:
    """
    Combine les détecteurs universels. Retourne le MAXIMUM des signaux
    déclenchés (pas de cumul) : un détecteur isolé donne la mesure du
    risque, la concordance entre familles de signaux est gérée par le
    moteur de fusion global (app/services/fusion_score.py), pas ici.
    """
    best_score = 0.0
    best_reasons: List[str] = []

    def consider(candidate_score: float, reason: str) -> None:
        nonlocal best_score, best_reasons
        if candidate_score > best_score:
            best_score = candidate_score
            best_reasons = [reason]
        elif candidate_score == best_score and candidate_score > 0:
            best_reasons.append(reason)

    # Vitesse
    if current.speed_kmh is not None:
        if current.speed_kmh > SPEED_CRITICAL_KMH:
            consider(SPEED_CRITICAL_SCORE, f"vitesse_critique:{current.speed_kmh:.0f}km/h")
        elif current.speed_kmh > SPEED_WARNING_KMH:
            consider(SPEED_WARNING_SCORE, f"vitesse_elevee:{current.speed_kmh:.0f}km/h")

    # Perte de signal
    if current.fix_quality == "perdu":
        consider(SIGNAL_LOST_SCORE, "signal_perdu")

    # Précision GPS dégradée
    if current.accuracy_m is not None and current.accuracy_m > ACCURACY_DEGRADED_M:
        consider(ACCURACY_DEGRADED_SCORE, f"precision_degradee:{current.accuracy_m:.0f}m")

    # Choc / IMU
    if current.acc_max_ms2 is not None:
        if current.acc_max_ms2 > SHOCK_CRITICAL_MS2:
            consider(SHOCK_CRITICAL_SCORE, f"choc_critique:{current.acc_max_ms2:.1f}m/s2")
        elif current.acc_max_ms2 > SHOCK_WARNING_MS2:
            consider(SHOCK_WARNING_SCORE, f"choc_modere:{current.acc_max_ms2:.1f}m/s2")

    # Écart soudain entre deux positions consécutives
    if previous is not None:
        dt_s = (current.ts - previous.ts).total_seconds()
        if 0 < dt_s <= SUDDEN_JUMP_MAX_SECONDS:
            jump_m = distance_m(previous.position, current.position)
            if jump_m > SUDDEN_JUMP_DISTANCE_M:
                consider(SUDDEN_JUMP_SCORE, f"ecart_soudain:{jump_m:.0f}m/{dt_s:.0f}s")

    return UniversalResult(score=best_score, reasons=best_reasons)
