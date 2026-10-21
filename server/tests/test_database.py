"""
Tests d'intégration sur une VRAIE base PostgreSQL/PostGIS créée depuis data/schema.sql.

Ignorés par défaut (la suite courante n'exige ni base ni Redis). Pour les lancer :

    docker run -d --name siren-test-db -e POSTGRES_USER=siren -e POSTGRES_PASSWORD=test \
        -e POSTGRES_DB=siren -p 127.0.0.1:55433:5432 \
        -v "$PWD/../data/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro" postgis/postgis:15-3.4
    SIREN_DB_TESTS=1 DATABASE_URL=postgresql+asyncpg://siren:test@127.0.0.1:55433/siren python -m pytest tests/test_database.py

Ils vérifient ce que les tests sans base ne peuvent pas voir : types uuid et
énumérations PostgreSQL, contraintes, triggers, partitions, parcours API complets.
"""
import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(os.environ.get("SIREN_DB_TESTS") != "1", reason="SIREN_DB_TESTS=1 et DATABASE_URL requis")

PASSWORD = "Yaounde2026!"


@pytest.fixture
def client(db_client):
    return db_client


@pytest.fixture(autouse=True)
def generous_ip_limits(monkeypatch):
    # Toute la suite partage l'IP « testclient » : les plafonds par IP sont testés à part.
    from app.core.config import settings

    monkeypatch.setattr(settings, "REGISTER_MAX_PER_IP_PER_HOUR", 100_000)
    monkeypatch.setattr(settings, "OTP_MAX_PER_IP_PER_HOUR", 100_000)
    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES_PER_IP", 100_000)


def unique_email(prefix: str) -> str:
    return f"{prefix}.{uuid.uuid4().hex[:10]}@example.org"


def unique_phone() -> str:
    """Numéro mobile camerounais valide et unique (+237 6XX XX XX XX)."""
    import random

    return "+2376" + random.choice("5789") + "".join(random.choice("0123456789") for _ in range(7))


def register(client, prefix="parent", email=True, phone=None):
    email = unique_email(prefix) if email else None
    payload = {"nom": prefix.title(), "telephone": phone or unique_phone(), "password": PASSWORD, "langue": "fr",
               "acceptedTermsVersion": "2026-09-30", "acceptedPrivacyVersion": "2026-09-30"}
    if email:
        payload["email"] = email
    r = client.post("/api/v1/auth/register", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    return email, {"Authorization": f"Bearer {body['accessToken']}"}, body


def sql(statement: str, *args):
    """Exécute une requête de vérification directement sur la base de test."""
    import asyncio
    import re

    import asyncpg

    async def run():
        conn = await asyncpg.connect(re.sub(r"^postgresql\+\w+://", "postgresql://", os.environ["DATABASE_URL"]))
        try:
            return await conn.fetch(statement, *args)
        finally:
            await conn.close()

    return asyncio.run(run())


def new_serial() -> str:
    """Numéro au format SIREN-XXXXX-XXXXX, casse mélangée (sensible à la casse)."""
    raw = uuid.uuid4().hex
    return f"SIREN-{raw[:5].upper()}-{raw[5:10]}"


def new_device(pin_hash: str | None = None, key_hash: str = "test") -> str:
    device_id = new_serial()
    sql("INSERT INTO devices (device_id, secret_key_hash, activation_pin_hash) VALUES ($1, $2, $3)", device_id, key_hash, pin_hash)
    return device_id


def test_inscription_connexion_et_consentement(client):
    email, headers, body = register(client)
    assert body["user"]["role"] == "principal" and body["user"]["langue"] == "fr"
    row = sql("SELECT terms_version, legal_accepted_at FROM users WHERE email = $1", email)[0]
    assert row["terms_version"] == "2026-09-30" and row["legal_accepted_at"] is not None
    login = client.post("/api/v1/auth/login", json={"email": email.upper(), "password": PASSWORD})
    assert login.status_code == 200 and login.json()["twofaRequired"] is False
    assert client.get("/api/v1/users/me", headers=headers).json()["email"] == email
    # Doublon : motif structuré.
    again = client.post("/api/v1/auth/register", json={"nom": "X", "email": email, "telephone": unique_phone(), "password": PASSWORD})
    assert again.status_code == 409 and again.json()["detail"]["code"] == "email_taken"


def test_enfant_lieux_perimetres_et_plafonds(client):
    _, headers, _ = register(client)
    child = client.post("/api/v1/children", headers=headers, json={"prenom": "Lina", "deviceId": new_device()})
    assert child.status_code in (200, 201), child.text
    child_id = child.json()["id"]
    place = client.post(f"/api/v1/children/{child_id}/places", headers=headers,
                        json={"nom": "École", "lat": 4.05, "lon": 9.7, "radiusM": 120,
                              "schedule": {"jours": [1, 2, 3, 4, 5], "heureDebut": "07:30", "heureFin": "15:30"}})
    assert place.status_code in (200, 201), place.text
    fence = client.post(f"/api/v1/children/{child_id}/geofences", headers=headers,
                        json={"nom": "Quartier", "type": "autorise", "lat": 4.05, "lon": 9.7, "radiusM": 1500})
    assert fence.status_code in (200, 201), fence.text
    assert sql("SELECT radius_m FROM geofences WHERE id = $1::uuid", fence.json()["id"])[0]["radius_m"] == 1500
    # Photo locale refusée proprement (validation), jamais une erreur 500.
    bad = client.post("/api/v1/children", headers=headers, json={"prenom": "Awa", "deviceId": new_device(), "photoUrl": "file:///x.jpg"})
    assert bad.status_code == 422


def test_partage_regles_api_et_base(client):
    parent_email, headers, _ = register(client, "parent")
    child_id = client.post("/api/v1/children", headers=headers, json={"prenom": "Noa", "deviceId": new_device()}).json()["id"]
    invitees = [register(client, f"proche{i}")[0] for i in range(4)]

    r = client.post(f"/api/v1/children/{child_id}/shares", headers=headers, json={"userIdentifier": parent_email.upper(), "permissions": []})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "self_invite"

    created = []
    for email in invitees[:3]:
        r = client.post(f"/api/v1/children/{child_id}/shares", headers=headers, json={"userIdentifier": email, "permissions": ["etat_zone"]})
        assert r.status_code == 201, r.text
        assert r.json()["notified"] is False  # aucun canal email configuré : jamais de faux envoi
        created.append(r.json()["id"])
    r = client.post(f"/api/v1/children/{child_id}/shares", headers=headers, json={"userIdentifier": invitees[3], "permissions": []})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "secondary_limit"

    # Révoquer puis ré-inviter la même personne réutilise la ligne (contrainte uq_secondary_access).
    assert client.patch(f"/api/v1/children/shares/{created[0]}", headers=headers, json={"status": "revoque"}).status_code == 200
    r = client.post(f"/api/v1/children/{child_id}/shares", headers=headers, json={"userIdentifier": invitees[0], "permissions": []})
    assert r.status_code == 201 and r.json()["id"] == created[0] and r.json()["status"] == "invite"

    # La base refuse aussi un 4e proche si l'API était contournée.
    stranger = sql("SELECT id FROM users WHERE email = $1", invitees[3])[0]["id"]
    with pytest.raises(Exception) as exc:
        sql("INSERT INTO secondary_access (child_id, user_id, permissions) VALUES ($1::uuid, $2, '{}')", child_id, stranger)
    assert "secondary_limit" in str(exc.value)


def test_positions_partitionnees_et_aucune_alerte_automatique(client):
    _, headers, _ = register(client)
    child_id = client.post("/api/v1/children", headers=headers, json={"prenom": "Eli", "deviceId": new_device()}).json()["id"]
    sql("INSERT INTO positions (child_id, geom, ts) VALUES ($1::uuid, ST_SetSRID(ST_MakePoint(9.7, 4.05), 4326), '2026-11-02T10:00:00Z')", child_id)
    part = sql("SELECT tableoid::regclass::text AS p FROM positions WHERE child_id = $1::uuid", child_id)[0]["p"]
    assert part == "positions_2026_11"
    # Un score en pré-alerte ne crée plus d'alerte par trigger : le serveur décide (escalade + 2 mesures).
    sql("INSERT INTO risk_scores (child_id, score, state) VALUES ($1::uuid, 45, 'prealerte')", child_id)
    assert sql("SELECT count(*) AS n FROM alerts WHERE child_id = $1::uuid", child_id)[0]["n"] == 0


def test_evenements_dispositif_acceptes(client):
    device_id = new_device()
    for value in ("arrachement", "batterie_faible", "allumage", "extinction", "en_charge", "autre"):
        sql("INSERT INTO device_events (device_id, event_type) VALUES ($1, $2::device_event_type)", device_id, value)
    assert sql("SELECT count(*) AS n FROM device_events WHERE device_id = $1", device_id)[0]["n"] == 6


def test_migrations_enregistrees():
    versions = [r["version"] for r in sql("SELECT version FROM schema_migrations ORDER BY version")]
    assert versions[:5] == ["001", "002", "003", "004", "005"]


def test_telemetrie_regles_declarative_universelle_et_alerte(client):
    """Chaîne complète sur PostGIS réel : télémétrie → couches déclarative + universelle → score → alerte (escalade)."""
    from datetime import datetime, timedelta, timezone

    from app.core.security import hash_password

    _, headers, _ = register(client)
    device_id = new_device(key_hash=hash_password("cle-dispositif"))
    child_id = client.post("/api/v1/children", headers=headers, json={"prenom": "Lina", "deviceId": device_id}).json()["id"]
    # Périmètre de vie autour de (4.05, 9.70), rayon 1500 m ; lieu interdit à 3 km au nord, rayon 200 m.
    client.post(f"/api/v1/children/{child_id}/geofences", headers=headers,
                json={"nom": "Quartier", "type": "autorise", "lat": 4.05, "lon": 9.70, "radiusM": 1500})
    forbidden = client.post(f"/api/v1/children/{child_id}/geofences", headers=headers,
                            json={"nom": "Chantier", "type": "interdit", "lat": 4.077, "lon": 9.70, "radiusM": 200}).json()

    def send(lat, lon, speed, minutes_ago):
        ts = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
        r = client.post("/api/v1/device/v1/telemetry",
                        json={"deviceId": device_id, "key": "cle-dispositif",
                              "batch": [{"lat": lat, "lon": lon, "speed": speed, "accuracy": 10, "battery": 80, "ts": ts}]})
        assert r.status_code == 200, r.text
        return client.get(f"/api/v1/children/{child_id}/risk", headers=headers).json()

    calm = send(4.05, 9.70, 3, 30)
    assert calm["state"] == "veille", calm
    # R1 : dans le lieu interdit, à vitesse de véhicule (> 80 km/h) → raisons déclarative ET universelle.
    risky = send(4.077, 9.70, 95, 1)
    assert any(r.startswith("zone_interdite:") and forbidden["id"] in r for r in risky["reasons"]), risky
    assert any(r.startswith("vitesse_critique:") for r in risky["reasons"]), risky
    assert risky["score"] > calm["score"]
    alerts = sql("SELECT level::text AS level FROM alerts WHERE child_id = $1::uuid", child_id)
    assert len(alerts) <= 1  # une alerte par escalade, jamais une par point
