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

    def add(self, obj):
        pass


@pytest.fixture
def client():
    async def fake_db():
        yield FakeSession()

    app.dependency_overrides[get_db] = fake_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def user(**overrides):
    base = dict(id="u1", nom="Marie", email="marie@example.com", telephone=None, role="principal", langue="fr",
                twofa_enabled=False, email_verified_at=None, deleted_at=None, password_hash=hash_password(PASSWORD),
                created_at=__import__("datetime").datetime(2026, 1, 1))
    base.update(overrides)
    return NS(**base)


def test_login_with_2fa_returns_a_challenge_and_no_session(client, monkeypatch):
    marie = user(twofa_enabled=True)

    async def by_email(db, email):
        return marie

    async def issue(db, u, purpose):
        assert purpose == "login_2fa"
        return {"challengeToken": "tok-" + "x" * 20, "expiresIn": 600, "sent": True}

    monkeypatch.setattr("app.api.v1.endpoints.auth.crud_user.get_by_email", by_email)
    monkeypatch.setattr("app.api.v1.endpoints.auth.otp.issue", issue)
    body = client.post("/api/v1/auth/login", json={"email": "marie@example.com", "password": PASSWORD}).json()
    assert body["twofaRequired"] is True and body["challengeToken"]
    assert "accessToken" not in body and "refreshToken" not in body and "user" not in body


def test_wrong_password_has_a_stable_code(client, monkeypatch):
    async def by_email(db, email):
        return user()

    monkeypatch.setattr("app.api.v1.endpoints.auth.crud_user.get_by_email", by_email)
    r = client.post("/api/v1/auth/login", json={"email": "marie@example.com", "password": "Mauvais2026!"})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "invalid_credentials"


def test_forgot_password_refuses_to_pretend_without_email_channel(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "disabled")
    r = client.post("/api/v1/auth/forgot", json={"email": "marie@example.com"})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "email_unavailable"


def test_forgot_password_does_not_reveal_unknown_accounts(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "smtp")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.org")
    monkeypatch.setattr(settings, "EMAIL_FROM", "noreply@example.org")

    async def nobody(db, email):
        return None

    monkeypatch.setattr("app.api.v1.endpoints.auth.crud_user.get_by_email", nobody)
    body = client.post("/api/v1/auth/forgot", json={"email": "inconnu@example.org"}).json()
    assert set(body) == {"challengeToken", "expiresIn"}


def test_console_email_backend_is_refused_outside_development(monkeypatch):
    from app.services.email.sender import email_backend

    monkeypatch.setattr(settings, "EMAIL_BACKEND", "console")
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert email_backend() == "disabled"


def test_enabling_2fa_requires_password_and_email_channel(client, monkeypatch):
    marie = user()
    app.dependency_overrides[get_current_user] = lambda: marie
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "disabled")
    r = client.put("/api/v1/users/me/2fa", json={"enabled": True, "password": "Mauvais2026!"})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "password_incorrect"
    r = client.put("/api/v1/users/me/2fa", json={"enabled": True, "password": PASSWORD})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "email_unavailable"
    assert marie.twofa_enabled is False
