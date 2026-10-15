"""
Tests de la couche 2 (détecteurs universels) — app/rules/universal.py

Lance avec : pytest tests/test_universal_thresholds.py -v
"""
from datetime import datetime, timedelta, timezone

from app.rules.geo import Point
from app.rules.universal import (
    ACCURACY_DEGRADED_SCORE,
    SHOCK_CRITICAL_SCORE,
    SHOCK_WARNING_SCORE,
    SIGNAL_LOST_SCORE,
    SPEED_CRITICAL_SCORE,
    SPEED_WARNING_SCORE,
    SUDDEN_JUMP_SCORE,
    TelemetryPoint,
    evaluate_universal,
)

NOW = datetime(2026, 10, 12, 12, 0, tzinfo=timezone.utc)


def _point(**overrides) -> TelemetryPoint:
    base = dict(
        position=Point(4.05, 9.70),
        ts=NOW,
        speed_kmh=10.0,
        accuracy_m=20.0,
        fix_quality="bon",
        acc_max_ms2=0.5,
    )
    base.update(overrides)
    return TelemetryPoint(**base)


def test_valeurs_normales_aucun_signal():
    result = evaluate_universal(_point())
    assert result.score == 0.0
    assert result.reasons == []


def test_vitesse_elevee():
    result = evaluate_universal(_point(speed_kmh=60))
    assert result.score == SPEED_WARNING_SCORE


def test_vitesse_critique():
    result = evaluate_universal(_point(speed_kmh=95))
    assert result.score == SPEED_CRITICAL_SCORE


def test_signal_perdu():
    result = evaluate_universal(_point(fix_quality="perdu"))
    assert result.score == SIGNAL_LOST_SCORE


def test_precision_degradee():
    result = evaluate_universal(_point(accuracy_m=600))
    assert result.score == ACCURACY_DEGRADED_SCORE


def test_choc_modere():
    result = evaluate_universal(_point(acc_max_ms2=4))
    assert result.score == SHOCK_WARNING_SCORE


def test_choc_critique():
    result = evaluate_universal(_point(acc_max_ms2=6))
    assert result.score == SHOCK_CRITICAL_SCORE


def test_le_signal_le_plus_grave_domine():
    # vitesse élevée (0.3) ET choc critique (0.8) en même temps -> on garde 0.8
    result = evaluate_universal(_point(speed_kmh=60, acc_max_ms2=6))
    assert result.score == SHOCK_CRITICAL_SCORE
    assert result.reasons == ["choc_critique:6.0m/s2"]


def test_ecart_soudain_entre_deux_points_declenche():
    previous = _point(position=Point(4.05, 9.70), ts=NOW)
    current = _point(position=Point(4.07, 9.72), ts=NOW + timedelta(seconds=90))
    result = evaluate_universal(current, previous)
    assert result.score == SUDDEN_JUMP_SCORE


def test_petit_deplacement_ne_declenche_rien():
    previous = _point(position=Point(4.05, 9.70), ts=NOW)
    current = _point(position=Point(4.0501, 9.7001), ts=NOW + timedelta(seconds=90))
    result = evaluate_universal(current, previous)
    assert result.score == 0.0


def test_ecart_important_mais_trop_lent_ne_declenche_rien():
    # Même distance que le test déclenché, mais étalée sur 10 minutes :
    # ce n'est plus un écart "soudain".
    previous = _point(position=Point(4.05, 9.70), ts=NOW)
    current = _point(position=Point(4.07, 9.72), ts=NOW + timedelta(minutes=10))
    result = evaluate_universal(current, previous)
    assert result.score == 0.0
