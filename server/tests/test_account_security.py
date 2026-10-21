"""Téléphone, numéro de série, canaux OTP, en-têtes de sécurité (sans base)."""
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.core.phone import InvalidPhone, mask_phone, normalize_phone
from app.core.serial import InvalidSerial, parse_serial
from app.services import otp, otp_delivery


@pytest.mark.parametrize(
    "raw, expected",
    [("690 12 34 56", "+237690123456"), ("+237 6 90 12 34 56", "+237690123456"), ("00237690123456", "+237690123456"),
     ("+33 6 12 34 56 78", "+33612345678"), ("+1 650-253-0000", "+16502530000"), ("+237 123456789", None)],
)
def test_phone_is_normalized_to_e164_without_fixed_length(raw, expected):
    if expected is None:
        # Longueur plausible mais plan de numérotation camerounais non respecté : refusé.
        with pytest.raises(InvalidPhone):
            normalize_phone(raw)
    else:
        assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "abc", "+", "12", "+237 123"])
def test_invalid_phones_are_refused(raw):
    with pytest.raises(InvalidPhone):
        normalize_phone(raw)


def test_mask_phone_hides_the_middle():
    masked = mask_phone("+237690123456")
    assert masked.startswith("+237") and masked.endswith("56") and "9012" not in masked


@pytest.mark.parametrize("serial", ["SIREN-AB12C-XY9Z0", "SIREN-ab12c-xy9z0", " SIREN-00000-zzzzz "])
def test_serial_format_is_exact_and_case_sensitive(serial):
    assert parse_serial(serial) == serial.strip()


@pytest.mark.parametrize("serial", ["siren-AB12C-XY9Z0", "SIREN-AB12CXY9Z0", "SIREN-AB12C-XY9Z", "SIREN-AB12C-XY9Z0-", "SIREN-AB 2C-XY9Z0",
                                    "SIREN-ÀB12C-XY9Z0", "https://evil.example/SIREN-AB12C-XY9Z0", "AB12CXY9Z0"])
def test_malformed_serials_are_refused(serial):
    with pytest.raises(InvalidSerial):
        parse_serial(serial)


def test_code_normalization_accepts_spaces_and_lowercase():
    assert otp.normalize_code(" ab3-k9 ") == "AB3K9"


@pytest.fixture
def every_channel():
    otp_delivery.set_test_sender(lambda *a: None)
    yield
    otp_delivery.set_test_sender(None)


def account(**kw):
    return SimpleNamespace(**{"telephone": "+237690123456", "email": None, "email_verified_at": None, **kw})


def test_email_channel_requires_a_verified_address(every_channel):
    assert otp.allowed_channels(account(), "login_2fa") == ["sms", "whatsapp"]
    assert otp.allowed_channels(account(email="a@b.org"), "login_2fa") == ["sms", "whatsapp"]
    assert otp.allowed_channels(account(email="a@b.org", email_verified_at=1), "login_2fa") == ["sms", "whatsapp", "email"]


def test_phone_change_never_uses_email(every_channel):
    assert "email" not in otp.allowed_channels(account(email="a@b.org", email_verified_at=1), "phone_change")


def test_phone_is_never_proven_by_email(every_channel):
    verified_mail = account(email="a@b.org", email_verified_at=1)
    assert otp.allowed_channels(verified_mail, "phone_verify") == ["sms", "whatsapp"]


@pytest.mark.parametrize("purpose", ["phone_verify", "phone_change"])
async def test_issue_refuses_email_for_phone_proof_even_in_dev(purpose, monkeypatch):
    from fastapi import HTTPException

    monkeypatch.setattr(settings, "OTP_MODE", "dev")
    with pytest.raises(HTTPException) as exc:
        await otp.issue(None, account(email="a@b.org", email_verified_at=1, id="u"), purpose, channel="email", pending_value="+237690000001")
    assert exc.value.status_code == 400 and exc.value.detail["code"] == "channel_not_allowed"


@pytest.mark.parametrize("raw", ["690000000", "690 000 000", "+237690000000", "6-90-00-00-00", "00237 690000000"])
def test_login_limit_key_is_the_canonical_identifier(raw):
    from app.api.v1.endpoints.auth import canonical_identifier

    assert canonical_identifier(raw) == "+237690000000"
    assert canonical_identifier(" Parent@Example.ORG ") == "parent@example.org"


def test_command_ids_must_be_uuids():
    from app.services.device_commands import is_command_id

    assert is_command_id("6f1c1f8e-3b0a-4c39-9a51-0c4f7c3f1b2a")
    assert not is_command_id("1; DROP TABLE device_commands") and not is_command_id("")


def test_email_verification_only_by_email(every_channel):
    assert otp.allowed_channels(account(email="a@b.org"), "signup_verify") == ["email"]
    assert otp.allowed_channels(account(), "signup_verify") == []


def test_no_channel_is_claimed_without_provider(monkeypatch):
    monkeypatch.setattr(settings, "SMS_PROVIDER", "")
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "")
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "disabled")
    assert otp_delivery.available_channels() == []
    assert otp.allowed_channels(account(), "login_2fa") == []


def test_sms_text_contains_code_and_never_a_link():
    text = otp_delivery.sms_text(otp_delivery.OtpMessage(code="AB3K9Q", minutes=10, language="en", purpose="login_2fa", name="X"))
    assert "AB3K9Q" in text and "http" not in text


def test_security_headers_on_api_responses(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    r = TestClient(app).get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    from app.core.security_headers import security_headers

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    headers = security_headers("/api/v1/users/me")
    assert headers["Strict-Transport-Security"].startswith("max-age=") and headers["Cache-Control"] == "no-store"


def test_client_ip_ignores_spoofable_forwarded_entries(monkeypatch):
    from app.services.rate_limit import client_ip

    request = SimpleNamespace(headers={"x-forwarded-for": "1.2.3.4, 10.0.0.9"}, client=SimpleNamespace(host="172.18.0.5"))
    from app.core.config import Settings

    assert Settings.model_fields["TRUST_PROXY_HEADERS"].default is False  # défaut sûr : opt-in explicite
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    assert client_ip(request) == "172.18.0.5"
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    assert client_ip(request) == "10.0.0.9"


def test_production_refuses_command_channel_without_strong_key(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "DEVICE_COMMAND_CHANNEL", "mqtt")
    monkeypatch.setattr(settings, "DEVICE_COMMAND_SIGNING_KEY", "court")
    assert any("DEVICE_COMMAND_SIGNING_KEY" in p for p in settings.unsafe_production_settings())


def test_production_refuses_template_placeholders(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "a-remplacer-par-un-secret-fort-de-48-caracteres-minimum")
    assert any("SECRET_KEY" in p for p in settings.unsafe_production_settings())
