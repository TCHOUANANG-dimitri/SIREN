"""Tests de routes sans base de données (dépendances substituées)."""
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.main import app


class FakeSession:
    async def execute(self, *args, **kwargs):
        raise AssertionError("aucun accès base attendu dans ce test")

    async def flush(self):
        pass


@pytest.fixture
def client():
    async def fake_db():
        yield FakeSession()

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_current_user] = lambda: NS(id="parent", role="principal", deleted_at=None)
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_children_alerts_route_is_not_shadowed_by_child_id(client, monkeypatch):
    from app.crud.child import crud_child

    async def no_children(db, user_id, role):
        return []

    monkeypatch.setattr(crud_child, "list_by_user", no_children)
    response = client.get("/api/v1/children/alerts")
    assert response.status_code == 200 and response.json() == []


def test_register_enforces_password_policy_server_side(client):
    response = client.post("/api/v1/auth/register", json={"nom": "P", "email": "p@example.org", "password": "abc123"})
    assert response.status_code == 422


def test_otp_disabled_outside_development(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert client.post("/api/v1/auth/request-otp", json={}).json() == {"required": False, "sent": False}


def test_websocket_rejects_invalid_token(client):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/api/v1/ws?token=forged&childId=c1") as ws:
            ws.receive_text()
    assert exc.value.code == 4001


def test_device_settings_patch_validates_values(client):
    response = client.patch("/api/v1/children/c1/device/settings", json={"energyMode": "turbo"})
    assert response.status_code == 422
    response = client.patch("/api/v1/children/c1/device/settings", json={"sensitivity": 150})
    assert response.status_code == 422
