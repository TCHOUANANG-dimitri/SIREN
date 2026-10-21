"""OTP (sans base), catalogue d'emails et de notifications push : règles de sécurité et bilinguisme."""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

import pytest

from app.core.config import settings
from app.services import otp
from app.services.email.templates import CATALOG, render, template_fields
from app.services.push import CHANNELS, NOTIFICATIONS, SECONDARY_PERMISSION, build_notification

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc)


def challenge(code="123456", **overrides):
    base = dict(code_hash=otp.digest(code), expires_at=NOW + timedelta(minutes=5), consumed_at=None, attempts=0)
    base.update(overrides)
    return NS(**base)


def test_otp_accepts_the_right_code_once():
    assert otp.evaluate_attempt(challenge(), "123456", NOW) == "ok"
    assert otp.evaluate_attempt(challenge(consumed_at=NOW), "123456", NOW) == "consumed"


@pytest.mark.parametrize(
    "overrides,code,verdict",
    [
        ({}, "000000", "invalid"),
        ({"expires_at": NOW - timedelta(seconds=1)}, "123456", "expired"),
        ({"attempts": 5}, "123456", "too_many"),  # même le bon code est refusé après 5 essais
    ],
)
def test_otp_refusals(overrides, code, verdict):
    assert otp.evaluate_attempt(challenge(**overrides), code, NOW) == verdict


def test_otp_errors_are_structured():
    err = otp.verdict_error("too_many")
    assert err.status_code == 429 and err.detail["code"] == "otp_attempts_exceeded"
    assert otp.verdict_error("expired").detail["code"] == "otp_expired"
    assert otp.verdict_error("invalid").detail["code"] == "otp_invalid"


def test_otp_code_is_random_outside_dev(monkeypatch):
    monkeypatch.setattr(settings, "OTP_MODE", "live")
    codes = {otp.generate_code() for _ in range(50)}
    # Alphanumérique, 6 caractères au plus, sans caractères ambigus (0/O, 1/I/L).
    assert all(len(c) == 6 and set(c) <= set(otp.CODE_ALPHABET) for c in codes)
    assert len(codes) > 40
    assert settings.DEV_OTP_CODE not in codes or len(codes) > 1


def test_otp_values_are_never_stored_in_clear():
    assert otp.digest("123456") != "123456" and len(otp.digest("123456")) == 64
    assert otp.new_challenge_token() != otp.new_challenge_token()


@pytest.mark.parametrize("template", sorted(CATALOG))
def test_email_templates_have_same_variables_in_fr_and_en(template):
    assert template_fields(template, "fr") == template_fields(template, "en")


@pytest.mark.parametrize("template", sorted(CATALOG))
@pytest.mark.parametrize("lang", ["fr", "en"])
def test_email_templates_render_without_placeholders(template, lang):
    variables = {name: "X<b>" for name in template_fields(template, lang)}
    if "state" in variables:
        variables["state"] = "enabled"
    email = render(template, lang, variables)
    assert "{" not in email.subject + email.text
    assert "<b>" not in email.html  # variables échappées dans le HTML
    assert email.language == lang and email.version


def test_otp_email_states_expiry_and_contains_no_other_secret():
    email = render("login_2fa", "en", {"name": "Marie", "code": "482913", "minutes": 10})
    assert "482913" in email.text and "10 minutes" in email.text
    assert "password" not in email.subject.lower()


def test_email_falls_back_to_french_for_unknown_language():
    assert render("password_changed", "de", {"name": "A"}).language == "fr"


def test_missing_variable_is_an_error_not_a_blank():
    with pytest.raises(KeyError):
        render("login_2fa", "fr", {"name": "A"})


def _vars(text):
    from string import Formatter

    return {n for _, n, _, _ in Formatter().parse(text) if n}


@pytest.mark.parametrize("kind", sorted(NOTIFICATIONS))
def test_push_catalog_is_bilingual_with_same_variables(kind):
    fr, en = NOTIFICATIONS[kind]["fr"], NOTIFICATIONS[kind]["en"]
    assert _vars(fr["title"] + fr["body"]) == _vars(en["title"] + en["body"])
    assert kind in CHANNELS


def test_push_uses_recipient_language_and_structured_payload():
    msg = build_notification("urgence", "en", {"child": "Léa"}, {"childId": "c1", "alertId": "a1"})
    assert msg["title"] == "Emergency — Léa" and msg["channel"] == "siren-urgence"
    data = msg["data"]
    assert data["type"] == "urgence" and data["titleKey"] == "notifications.push.urgence.title"
    assert json.loads(data["vars"]) == {"child": "Léa"} and data["childId"] == "c1"
    assert all(isinstance(v, str) for v in data.values())  # FCM n'accepte que des chaînes
    assert build_notification("urgence", None, {"child": "Léa"})["title"].startswith("Urgence")


def test_secondaries_get_alerts_only_with_the_matching_right():
    assert SECONDARY_PERMISSION["urgence"] == "alertes_urgence"
    assert SECONDARY_PERMISSION["prealerte"] == "alertes_prealerte"
    assert SECONDARY_PERMISSION["low_battery"] is None  # parent principal uniquement


def test_app_and_server_push_catalogs_match():
    """Les textes utilisés au premier plan / en mock côté app doivent couvrir les mêmes types."""
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[2] / "src" / "i18n" / "locales"
    for lang in ("fr", "en"):
        app_push = json.loads((root / lang / "notifications.json").read_text())["notifications"]["push"]
        assert set(app_push) == set(NOTIFICATIONS)
        for kind, texts in app_push.items():
            server = NOTIFICATIONS[kind][lang]
            app_vars = {v.strip("{}") for v in __import__("re").findall(r"\{\{(\w+)\}\}", texts["title"] + texts["body"])}
            assert app_vars == _vars(server["title"] + server["body"]), kind
