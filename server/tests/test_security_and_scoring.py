import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.security import create_refresh_token, hash_token
from app.schemas.auth import RegisterRequest
from app.services.fusion_score import SubScores, _determine_state, compute_fusion


def test_refresh_token_hash_is_deterministic_and_tokens_unique():
    token = create_refresh_token("u1")
    assert hash_token(token) == hash_token(token)
    assert create_refresh_token("u1") != token  # jti : rotation fiable même dans la même seconde


@pytest.mark.parametrize("password", ["Court1!", "sansmajuscule1!", "SansChiffre!!!", "SansSymbole123"])
def test_register_rejects_weak_passwords(password):
    with pytest.raises(ValidationError):
        RegisterRequest(nom="Parent", email="parent@example.org", password=password)


def test_register_accepts_policy_compliant_password():
    RegisterRequest(nom="Parent", email="parent@example.org", password="Yaounde2026!")


@pytest.mark.parametrize(
    "env,mode,expected",
    [
        ("development", "", "dev"),
        ("production", "", "disabled"),
        ("production", "dev", "disabled"),  # le code fixe n'est jamais accepté en production
        ("staging", "provider", "provider"),
    ],
)
def test_otp_mode_resolution(env, mode, expected):
    assert Settings(ENVIRONMENT=env, OTP_MODE=mode).otp_mode == expected


@pytest.mark.xfail(
    strict=True,
    reason=(
        "ÉCART IA-07 À VALIDER (pôle IA) : le serveur n'a pas de marge de désescalade ; "
        "le mock app (CDC2 §5.4) exige 2 mesures consécutives et une sortie de pré-alerte sous 25."
    ),
)
def test_hysteresis_avoids_flapping_around_30():
    state = None
    states = []
    for score in [31, 29, 31, 29]:
        state = _determine_state(score, state)
        states.append(state)
    assert states == ["prealerte", "prealerte", "prealerte", "prealerte"]


def test_urgence_is_sticky_until_below_prealerte_threshold():
    assert _determine_state(45, "urgence") == "urgence"
    assert _determine_state(10, "urgence") == "veille"
    assert _determine_state(5, "disparition") == "disparition"


def test_concordance_requires_two_active_signals():
    single = compute_fusion(SubScores(universel=0.9), model_confidence=1.0)
    double = compute_fusion(SubScores(universel=0.9, mouvement=0.9), model_confidence=1.0)
    assert not any(r.startswith("concordance") for r in single.reasons)
    assert any(r.startswith("concordance") for r in double.reasons)
    assert 0 <= double.score <= 100


def test_server_refuses_default_secrets_outside_development():
    assert Settings(ENVIRONMENT="development").unsafe_production_settings() == []
    problems = Settings(ENVIRONMENT="production").unsafe_production_settings()
    assert any("JWT_SECRET_KEY" in p for p in problems)
    strong = "x" * 48
    assert Settings(ENVIRONMENT="production", SECRET_KEY=strong, JWT_SECRET_KEY=strong).unsafe_production_settings() == []
