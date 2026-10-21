"""Parcours d'authentification sans base : 2FA sans jeton avant le code, pas de faux envoi d'email."""
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.main import app

PASSWORD = "Yaounde2026!"


class FakeSession:
    async def execute(self, *args, **kwargs):
        raise AssertionError("aucun accès base attendu")

    async def flush(self):
        pass

    async def commit(self):
        pass

    def add(self, obj):
        pass


@pytest.fixture
def client(monkeypatch):
    async def fake_db():
        yield FakeSession()

    # Sans base : la limitation de débit est neutralisée ici, testée sur vraie base (test_database.py).
    async def noop(*args, **kwargs):
        return None

    for name in ("ensure_below", "record", "clear", "hit"):
        monkeypatch.setattr(f"app.services.rate_limit.{name}", noop)

    app.dependency_overrides[get_db] = fake_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def user(**overrides):
    base = dict(id="u1", nom="Marie", email="marie@example.com", telephone="+237690000001", telephone_verified_at=None, role="principal", langue="fr",
                twofa_enabled=False, email_verified_at=None, deleted_at=None, password_hash=hash_password(PASSWORD),
                created_at=__import__("datetime").datetime(2026, 1, 1))
    base.update(overrides)
    return NS(**base)


def test_login_with_2fa_returns_an_mfa_token_and_no_session(client, monkeypatch):
    marie = user(twofa_enabled=True)

    async def by_identifier(db, identifier):
        return marie

    monkeypatch.setattr("app.api.v1.endpoints.auth.crud_user.get_by_identifier", by_identifier)
    body = client.post("/api/v1/auth/login", json={"identifier": "+237 6 90 00 00 01", "password": PASSWORD}).json()
    assert body["twofaRequired"] is True and body["mfaToken"]
    assert "accessToken" not in body and "refreshToken" not in body and "user" not in body
    # Le jeton MFA n'ouvre aucune session.
    r = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {body['mfaToken']}"})
    assert r.status_code == 401


def test_login_accepts_the_legacy_email_field(client, monkeypatch):
    seen = []

    async def by_identifier(db, identifier):
        seen.append(identifier)
        return None

    monkeypatch.setattr("app.api.v1.endpoints.auth.crud_user.get_by_identifier", by_identifier)
    r = client.post("/api/v1/auth/login", json={"email": "marie@example.com", "password": PASSWORD})
    assert r.status_code == 401 and seen == ["marie@example.com"]


def test_wrong_password_has_a_stable_code(client, monkeypatch):
    async def by_identifier(db, identifier):
        return user()

    monkeypatch.setattr("app.api.v1.endpoints.auth.crud_user.get_by_identifier", by_identifier)
    r = client.post("/api/v1/auth/login", json={"identifier": "marie@example.com", "password": "Mauvais2026!"})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "invalid_credentials"


def test_forgot_password_refuses_to_pretend_without_a_channel(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SMS_PROVIDER", "")
    r = client.post("/api/v1/auth/forgot", json={"identifier": "+237690000001", "channel": "sms"})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "channel_unavailable"


def test_forgot_password_does_not_reveal_unknown_accounts(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "smtp")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.org")
    monkeypatch.setattr(settings, "EMAIL_FROM", "noreply@example.org")

    async def nobody(db, identifier):
        return None

    monkeypatch.setattr("app.api.v1.endpoints.auth.crud_user.get_by_identifier", nobody)
    body = client.post("/api/v1/auth/forgot", json={"identifier": "inconnu@example.org", "channel": "email"}).json()
    assert set(body) == {"challengeToken", "expiresIn"}


def test_console_email_backend_is_refused_outside_development(monkeypatch):
    from app.services.email.sender import email_backend

    monkeypatch.setattr(settings, "EMAIL_BACKEND", "console")
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert email_backend() == "disabled"


def test_enabling_2fa_requires_password_and_a_channel(client, monkeypatch):
    marie = user()
    app.dependency_overrides[get_current_user] = lambda: marie
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "disabled")
    monkeypatch.setattr(settings, "SMS_PROVIDER", "")
    r = client.put("/api/v1/users/me/2fa", json={"enabled": True, "password": "Mauvais2026!"})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "password_incorrect"
    r = client.put("/api/v1/users/me/2fa", json={"enabled": True, "password": PASSWORD})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "channel_unavailable"
    assert marie.twofa_enabled is False
