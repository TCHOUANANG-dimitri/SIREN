"""Règles d'invitation (identiques côté app) et erreurs structurées des routes de partage."""
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.main import app
from app.services.identifiers import is_self, normalize_identifier, same_phone

ME = NS(id="parent", role="principal", deleted_at=None, email="marie@example.com", telephone="+237 6 90 12 34 56", nom="Marie", langue="fr")


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("  Marie@Example.COM ", ("marie@example.com", "email")),
        ("+237 6 90-12.34 56", ("+237690123456", "phone")),
        ("marie@", ("marie@", None)),
        ("12", ("12", None)),
    ],
)
def test_normalize_identifier(raw, expected):
    assert normalize_identifier(raw) == expected


def test_same_phone_tolerates_country_code_but_not_other_numbers():
    assert same_phone("+237690123456", "690123456")
    assert not same_phone("+237690123456", "690123457")
    assert not same_phone("1234", "1234")


@pytest.mark.parametrize("raw", ["MARIE@example.com", "+237690123456", "6 90 12 34 56"])
def test_self_invite_is_detected_in_any_form(raw):
    identifier, kind = normalize_identifier(raw)
    assert is_self(identifier, kind, ME)


class FakeSession:
    async def execute(self, *args, **kwargs):
        raise AssertionError("aucun accès base attendu")

    async def flush(self):
        pass


@pytest.fixture
def client(monkeypatch):
    async def fake_db():
        yield FakeSession()

    async def principal_access(db, user, child_id):
        return NS(require_principal=lambda: None, child=NS(id=child_id, prenom="Léa"), is_principal=True)

    monkeypatch.setattr("app.api.v1.endpoints.sharing.get_child_access", principal_access)
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = lambda: ME
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_self_invite_is_rejected_before_any_lookup(client):
    r = client.post("/api/v1/children/c1/shares", json={"userIdentifier": "Marie@Example.com", "permissions": []})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "self_invite"


def test_invalid_identifier_is_rejected(client):
    r = client.post("/api/v1/children/c1/shares", json={"userIdentifier": "pas-un-email", "permissions": []})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "identifier_invalid"


def test_unknown_invitee_has_a_stable_code(client, monkeypatch):
    async def nobody(db, identifier, kind):
        return None

    monkeypatch.setattr("app.api.v1.endpoints.sharing._find_user", nobody)
    r = client.post("/api/v1/children/c1/shares", json={"userIdentifier": "rose@example.com", "permissions": []})
    assert r.status_code == 404 and r.json()["detail"]["code"] == "invitee_not_found"


def test_duplicate_and_quota_have_stable_codes(client, monkeypatch):
    rose = NS(id="rose", email="rose@example.com", langue="en", nom="Rose", deleted_at=None)

    async def find(db, identifier, kind):
        return rose

    shares = [NS(id="s1", user_id="rose", status="invite")]

    async def list_by_child(db, child_id):
        return shares

    monkeypatch.setattr("app.api.v1.endpoints.sharing._find_user", find)
    monkeypatch.setattr("app.api.v1.endpoints.sharing.crud_share.list_by_child", list_by_child)
    r = client.post("/api/v1/children/c1/shares", json={"userIdentifier": "rose@example.com", "permissions": []})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "already_shared"

    shares[:] = [NS(id=f"s{i}", user_id=f"u{i}", status="actif") for i in range(3)]
    r = client.post("/api/v1/children/c1/shares", json={"userIdentifier": "rose@example.com", "permissions": []})
    assert r.status_code == 409 and r.json()["detail"] == {
        "code": "secondary_limit", "message": r.json()["detail"]["message"], "params": {"max": 3},
    }
