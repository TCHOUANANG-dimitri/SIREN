"""
Intégration sur VRAIE base (migrations 004-005) : téléphone obligatoire, OTP
multi-canal, changement de numéro, appairage SIREN-XXXXX-XXXXX + PIN,
trames du protocole, relais par téléphone, commandes et accusés signés.

Mêmes prérequis que tests/test_database.py (SIREN_DB_TESTS=1, DATABASE_URL).
Aucun fournisseur réel n'est appelé : l'adaptateur de test capture les envois.
"""
import asyncio
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.test_database import PASSWORD, client, generous_ip_limits, new_device, new_serial, register, sql, unique_phone  # noqa: F401

pytestmark = pytest.mark.skipif(os.environ.get("SIREN_DB_TESTS") != "1", reason="SIREN_DB_TESTS=1 et DATABASE_URL requis")

SIGNING_KEY = "cle-de-signature-de-test-0123456789abcdef"  # gitleaks:allow — clé factice des tests


@pytest.fixture
def outbox(monkeypatch):
    """Mode réel (codes aléatoires) avec l'adaptateur de test : capture (canal, destination, message)."""
    from app.core.config import settings
    from app.services import otp_delivery

    sent = []
    monkeypatch.setattr(settings, "OTP_MODE", "live")
    monkeypatch.setattr(settings, "OTP_RESEND_COOLDOWN_S", 0)
    otp_delivery.set_test_sender(lambda channel, destination, message: sent.append((channel, destination, message)))
    yield sent
    otp_delivery.set_test_sender(None)


def last_code(outbox) -> str:
    message = [m for _, _, m in outbox if not isinstance(m, str)][-1]
    return message.code


def bearer(body) -> dict:
    return {"Authorization": f"Bearer {body['accessToken']}"}


# --- Inscription et connexion --------------------------------------------------------------


def test_telephone_obligatoire_email_facultatif(client):
    phone = unique_phone()
    _, headers, body = register(client, email=False, phone=phone)
    assert body["user"]["email"] is None and body["user"]["telephone"] == phone
    assert body["user"]["phoneVerified"] is False
    assert sql("SELECT email FROM users WHERE telephone = $1", phone)[0]["email"] is None  # jamais d'e-mail inventé

    no_phone = client.post("/api/v1/auth/register", json={"nom": "X", "password": PASSWORD})
    assert no_phone.status_code == 422
    bad = client.post("/api/v1/auth/register", json={"nom": "X", "telephone": "+237 123", "password": PASSWORD})
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "phone_invalid"
    # Même numéro saisi au format local : reconnu comme doublon (normalisation E.164).
    local = phone[4:]
    dup = client.post("/api/v1/auth/register", json={"nom": "X", "telephone": local, "password": PASSWORD})
    assert dup.status_code == 409 and dup.json()["detail"]["code"] == "phone_taken"

    # La base refuse aussi un compte sans téléphone ou hors E.164 si l'API était contournée.
    with pytest.raises(Exception) as exc:
        sql("INSERT INTO users (nom, email, password_hash) VALUES ('Y', $1, 'x')", f"y{uuid.uuid4().hex[:6]}@example.org")
    assert "telephone_required" in str(exc.value)
    with pytest.raises(Exception):
        sql("INSERT INTO users (nom, telephone, password_hash) VALUES ('Y', '0690000000', 'x')")


def test_connexion_par_telephone_et_limitation(client):
    phone = unique_phone()
    register(client, email=False, phone=phone)
    ok = client.post("/api/v1/auth/login", json={"identifier": phone[4:], "password": PASSWORD})
    assert ok.status_code == 200 and ok.json()["user"]["telephone"] == phone
    for _ in range(5):
        r = client.post("/api/v1/auth/login", json={"identifier": phone, "password": "Mauvais2026!"})
        assert r.status_code == 401 and r.json()["detail"]["code"] == "invalid_credentials"
    # Même le bon mot de passe est refusé pendant la fenêtre : pas de force brute.
    blocked = client.post("/api/v1/auth/login", json={"identifier": phone, "password": PASSWORD})
    assert blocked.status_code == 429 and blocked.json()["detail"]["code"] == "rate_limited"
    # Compte inconnu : même réponse qu'un mauvais mot de passe.
    unknown = client.post("/api/v1/auth/login", json={"identifier": unique_phone(), "password": PASSWORD})
    assert unknown.status_code == 401 and unknown.json()["detail"]["code"] == "invalid_credentials"


# --- OTP --------------------------------------------------------------------------------


def request_phone_otp(client, headers, channel="sms", extra_headers=None):
    return client.post("/api/v1/auth/request-otp", headers={**headers, **(extra_headers or {})}, json={"channel": channel})


def test_verification_du_telephone_usage_unique(client, outbox):
    _, headers, body = register(client)
    r = request_phone_otp(client, headers, "whatsapp")
    assert r.status_code == 200 and r.json()["sent"] is True and "devHint" not in r.json()
    channel, destination, _ = outbox[-1]
    assert channel == "whatsapp" and destination == body["user"]["telephone"]
    code = last_code(outbox)
    assert len(code) == 6 and re.fullmatch(r"[A-HJKMNP-Z2-9]{6}", code)
    token = r.json()["challengeToken"]
    stored = sql("SELECT code_hash, token_hash, destination_hash FROM otp_challenges WHERE user_id = $1::uuid", body["user"]["id"])[0]
    assert code not in stored.values() and token not in stored.values()  # jamais en clair

    wrong = client.post("/api/v1/auth/verify-otp", json={"challengeToken": token, "code": "ZZZZZZ"})
    assert wrong.status_code == 400 and wrong.json()["detail"]["code"] == "otp_invalid"
    ok = client.post("/api/v1/auth/verify-otp", json={"challengeToken": token, "code": code.lower()})
    assert ok.status_code == 200 and ok.json()["user"]["phoneVerified"] is True
    replay = client.post("/api/v1/auth/verify-otp", json={"challengeToken": token, "code": code})
    assert replay.status_code == 400 and replay.json()["detail"]["code"] == "otp_expired"


def test_renvoi_invalide_le_code_precedent_et_essais_limites(client, outbox):
    _, headers, _ = register(client)
    first = request_phone_otp(client, headers).json()
    first_code = last_code(outbox)
    second = request_phone_otp(client, headers).json()
    second_code = last_code(outbox)
    stale = client.post("/api/v1/auth/verify-otp", json={"challengeToken": first["challengeToken"], "code": first_code})
    assert stale.status_code == 400 and stale.json()["detail"]["code"] == "otp_expired"
    for _ in range(5):
        client.post("/api/v1/auth/verify-otp", json={"challengeToken": second["challengeToken"], "code": "ZZZZZZ"})
    burnt = client.post("/api/v1/auth/verify-otp", json={"challengeToken": second["challengeToken"], "code": second_code})
    assert burnt.status_code == 429 and burnt.json()["detail"]["code"] == "otp_attempts_exceeded"


def test_code_expire(client, outbox):
    _, headers, body = register(client)
    token = request_phone_otp(client, headers).json()["challengeToken"]
    sql("UPDATE otp_challenges SET expires_at = now() - interval '1 second' WHERE user_id = $1::uuid", body["user"]["id"])
    r = client.post("/api/v1/auth/verify-otp", json={"challengeToken": token, "code": last_code(outbox)})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "otp_expired"


def test_usages_separes(client, outbox):
    _, headers, _ = register(client)
    token = request_phone_otp(client, headers).json()["challengeToken"]
    r = client.post("/api/v1/auth/2fa/verify", json={"challengeToken": token, "code": last_code(outbox)})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "challenge_invalid"


def test_plafonds_par_destination_et_par_ip(client, outbox, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "OTP_MAX_PER_HOUR", 100)
    monkeypatch.setattr(settings, "OTP_MAX_PER_DESTINATION_PER_HOUR", 2)
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)  # IP distinctes simulées par X-Forwarded-For
    _, headers, _ = register(client)
    assert request_phone_otp(client, headers).status_code == 200
    assert request_phone_otp(client, headers).status_code == 200
    r = request_phone_otp(client, headers)
    assert r.status_code == 429 and r.json()["detail"]["code"] == "otp_rate_limited"

    monkeypatch.setattr(settings, "OTP_MAX_PER_DESTINATION_PER_HOUR", 100)
    monkeypatch.setattr(settings, "OTP_MAX_PER_IP_PER_HOUR", 2)
    ip = {"X-Forwarded-For": f"198.51.100.{uuid.uuid4().int % 250}"}
    others = [register(client)[1] for _ in range(3)]
    codes = [request_phone_otp(client, h, extra_headers=ip).status_code for h in others]
    assert codes[:2] == [200, 200] and codes[2] == 429


def test_canal_non_configure_jamais_simule(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "OTP_MODE", "live")
    monkeypatch.setattr(settings, "SMS_PROVIDER", "")
    _, headers, _ = register(client)
    r = request_phone_otp(client, headers)
    assert r.status_code == 503 and r.json()["detail"]["code"] == "channel_unavailable"


def test_connexion_en_deux_etapes(client, outbox):
    phone = unique_phone()
    _, headers, _ = register(client, phone=phone)
    assert client.put("/api/v1/users/me/2fa", headers=headers, json={"enabled": True, "password": PASSWORD}).status_code == 200
    login = client.post("/api/v1/auth/login", json={"identifier": phone, "password": PASSWORD}).json()
    assert login["twofaRequired"] and "accessToken" not in login and "sms" in login["channels"]
    assert "email" not in login["channels"]  # e-mail non vérifié : jamais proposé
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {login['mfaToken']}"}).status_code == 401
    email_refused = client.post("/api/v1/auth/2fa/send", json={"mfaToken": login["mfaToken"], "channel": "email"})
    assert email_refused.status_code == 400 and email_refused.json()["detail"]["code"] == "channel_not_allowed"
    sent = client.post("/api/v1/auth/2fa/send", json={"mfaToken": login["mfaToken"], "channel": "sms"}).json()
    done = client.post("/api/v1/auth/2fa/verify", json={"challengeToken": sent["challengeToken"], "code": last_code(outbox)})
    assert done.status_code == 200 and done.json()["accessToken"]


def test_mot_de_passe_oublie_par_telephone(client, outbox):
    phone = unique_phone()
    register(client, email=False, phone=phone)
    unknown = client.post("/api/v1/auth/forgot", json={"identifier": unique_phone(), "channel": "sms"})
    known = client.post("/api/v1/auth/forgot", json={"identifier": phone, "channel": "sms"})
    assert unknown.status_code == known.status_code == 200
    assert set(unknown.json()) == set(known.json())  # même forme : pas d'énumération
    r = client.post("/api/v1/auth/reset-password", json={"challengeToken": known.json()["challengeToken"], "code": last_code(outbox),
                                                         "newPassword": "Douala2026!x"})
    assert r.status_code == 204
    assert client.post("/api/v1/auth/login", json={"identifier": phone, "password": "Douala2026!x"}).status_code == 200


# --- Changement de numéro ------------------------------------------------------------------


def start_change(client, headers, new_phone, password=PASSWORD):
    return client.post("/api/v1/users/me/phone", headers=headers, json={"currentPassword": password, "newPhone": new_phone, "channel": "sms"})


def test_changement_de_numero(client, outbox):
    old = unique_phone()
    _, headers, _ = register(client, phone=old)
    new = unique_phone()

    wrong_pw = start_change(client, headers, new, "Mauvais2026!")
    assert wrong_pw.status_code == 400 and wrong_pw.json()["detail"]["code"] == "password_incorrect"
    same = start_change(client, headers, old)
    assert same.status_code == 409 and same.json()["detail"]["code"] == "phone_unchanged"
    taken_phone = unique_phone()
    register(client, phone=taken_phone)
    taken = start_change(client, headers, taken_phone)
    assert taken.status_code == 409 and taken.json()["detail"]["code"] == "phone_taken"

    started = start_change(client, headers, new)
    assert started.status_code == 200 and outbox[-1][1] == new  # le code part vers le NOUVEAU numéro
    token, code = started.json()["challengeToken"], last_code(outbox)
    bad = client.post("/api/v1/users/me/phone/confirm", headers=headers, json={"challengeToken": token, "code": "ZZZZZZ"})
    assert bad.status_code == 400 and client.get("/api/v1/users/me", headers=headers).json()["telephone"] == old
    ok = client.post("/api/v1/users/me/phone/confirm", headers=headers, json={"challengeToken": token, "code": code})
    assert ok.status_code == 200 and ok.json()["telephone"] == new and ok.json()["phoneVerified"] is True
    notice = [(d, m) for c, d, m in outbox if isinstance(m, str)]
    assert notice and notice[-1][0] == old and new not in notice[-1][1]  # ancien numéro prévenu, nouveau masqué
    replay = client.post("/api/v1/users/me/phone/confirm", headers=headers, json={"challengeToken": token, "code": code})
    assert replay.status_code == 400


def test_changement_de_numero_code_d_un_autre_compte_refuse(client, outbox):
    _, alice, _ = register(client, "alice")
    _, bob, _ = register(client, "bob")
    token = start_change(client, alice, unique_phone()).json()["challengeToken"]
    stolen = client.post("/api/v1/users/me/phone/confirm", headers=bob, json={"challengeToken": token, "code": last_code(outbox)})
    assert stolen.status_code == 400


def test_changement_de_numero_pris_entre_temps(client, outbox):
    _, headers, _ = register(client)
    target = unique_phone()
    started = start_change(client, headers, target).json()
    code = last_code(outbox)
    register(client, phone=target)  # quelqu'un prend le numéro avant la confirmation
    r = client.post("/api/v1/users/me/phone/confirm", headers=headers, json={"challengeToken": started["challengeToken"], "code": code})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "phone_taken"


def test_changement_de_numero_fournisseur_indisponible(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "OTP_MODE", "live")
    monkeypatch.setattr(settings, "SMS_PROVIDER", "")
    old = unique_phone()
    _, headers, _ = register(client, phone=old)
    r = start_change(client, headers, unique_phone())
    assert r.status_code == 503 and r.json()["detail"]["code"] == "channel_unavailable"
    assert client.get("/api/v1/users/me", headers=headers).json()["telephone"] == old


def test_double_validation_simultanee_un_seul_succes(client, outbox):
    """Deux sessions valident le même code en même temps : le verrou de ligne n'en laisse passer qu'une."""
    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.services import otp

    _, headers, _ = register(client)
    token = start_change(client, headers, unique_phone()).json()["challengeToken"]
    code = last_code(outbox)

    async def race():
        engine = create_async_engine(os.environ["DATABASE_URL"])
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async def attempt():
            async with factory() as db:
                try:
                    await otp.consume(db, token, code, "phone_change")
                    await asyncio.sleep(0.3)  # l'autre session attend le verrou pendant ce temps
                    await db.commit()
                    return "ok"
                except HTTPException as error:
                    await db.rollback()
                    return error.detail["code"]

        try:
            return sorted(await asyncio.gather(attempt(), attempt()))
        finally:
            await engine.dispose()

    assert asyncio.run(race()) == ["ok", "otp_expired"]


# --- Appairage -------------------------------------------------------------------------


def pair(client, headers, device_id, pin=None, prenom="Lina"):
    body = {"prenom": prenom, "deviceId": device_id}
    if pin:
        body["activationPin"] = pin
    return client.post("/api/v1/children", headers=headers, json=body)


def swap_case(serial: str) -> str:
    head, body = serial[:6], serial[6:]
    return head + body.swapcase()


def test_appairage_strict_pin_dissociation_reassociation(client):
    from app.core.security import hash_password

    _, parent, _ = register(client, "parent")
    _, other, _ = register(client, "voisin")
    device = new_device(pin_hash=hash_password("K7Q2M9"))

    malformed = pair(client, parent, device.replace("-", ""))
    assert malformed.status_code == 422 and malformed.json()["detail"]["code"] == "serial_invalid"
    wrong_case = pair(client, parent, swap_case(device))
    assert wrong_case.status_code == 404  # sensible à la casse : aucune conversion
    lookup = client.get(f"/api/v1/children/devices/{device}", headers=parent)
    assert lookup.status_code == 200 and lookup.json()["pinRequired"] is True
    assert pair(client, parent, device).json()["detail"]["code"] == "pin_required"
    assert pair(client, parent, device, "AAAAAA").json()["detail"]["code"] == "pin_invalid"
    created = pair(client, parent, device, "K7Q2M9")
    assert created.status_code == 201 and created.json()["deviceId"] == device
    child_id = created.json()["id"]

    assert pair(client, parent, device, "K7Q2M9").json()["detail"]["code"] == "device_already_paired"
    assert pair(client, other, device, "K7Q2M9").json()["detail"]["code"] == "device_taken"
    assert client.get(f"/api/v1/children/devices/{device}", headers=other).status_code == 404

    # Seul le parent principal dissocie ; ensuite le boîtier peut être ré-associé.
    assert client.delete(f"/api/v1/children/{child_id}/device", headers=other).status_code in (403, 404)
    unpaired = client.delete(f"/api/v1/children/{child_id}/device", headers=parent)
    assert unpaired.status_code == 200 and unpaired.json()["deviceId"] is None
    repaired = client.put(f"/api/v1/children/{child_id}/device", headers=parent, json={"deviceId": device, "activationPin": "K7Q2M9"})
    assert repaired.status_code == 200 and repaired.json()["deviceId"] == device


def test_appairage_sans_pin_ne_revele_pas_un_dispositif_suivi(client):
    _, parent, _ = register(client, "parent")
    _, other, _ = register(client, "voisin")
    device = new_device()
    assert pair(client, parent, device).status_code == 201
    r = pair(client, other, device)
    assert r.status_code == 404 and r.json()["detail"]["code"] == "device_not_found"


def test_appairage_echecs_limites(client):
    _, parent, _ = register(client)
    for _ in range(5):
        assert pair(client, parent, new_serial()).status_code == 404
    r = pair(client, parent, new_device())
    assert r.status_code == 429 and r.json()["detail"]["code"] == "rate_limited"


# --- Trames, relais, commandes ------------------------------------------------------------


def frame(device_id, ts, evt="", bat="80"):
    value, threshold = ("4.5", "18.0") if evt else ("", "")
    return f"{device_id};4.050000;9.700000;{bat};3.0;{ts};{evt};{value};{threshold};8;72;90.0"


def iso(seconds_ago=0):
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def paired_child(client, key="cle-dispositif"):
    from app.core.security import hash_password

    _, headers, body = register(client)
    device = new_device(key_hash=hash_password(key))
    child_id = pair(client, headers, device).json()["id"]
    return headers, device, child_id


def test_trame_http_validee_dedoublonnee_et_evenement(client):
    headers, device, child_id = paired_child(client)
    ts = iso(60)
    assert client.post("/api/v1/device/v1/frame", json={"frame": frame(device, ts), "key": "mauvaise"}).status_code == 401
    bad = client.post("/api/v1/device/v1/frame", json={"frame": frame(device, ts).replace("4.050000", "95"), "key": "cle-dispositif"})
    assert bad.status_code == 422 and bad.json()["detail"]["params"]["reason"] == "lat_invalid"
    first = client.post("/api/v1/device/v1/frame", json={"frame": frame(device, ts), "key": "cle-dispositif"})
    assert first.status_code == 200 and first.json()["duplicate"] is False
    # Même trame par un second canal, ou à ± 2 s : jamais écrite deux fois.
    again = client.post("/api/v1/device/v1/frame", json={"frame": frame(device, ts), "key": "cle-dispositif"})
    near = client.post("/api/v1/device/v1/frame", json={"frame": frame(device, iso(59)), "key": "cle-dispositif"})
    assert again.json()["duplicate"] is True and near.json()["duplicate"] is True
    rows = sql("SELECT source FROM positions WHERE child_id = $1::uuid", child_id)
    assert [r["source"] for r in rows] == ["device"]
    low = client.post("/api/v1/device/v1/frame", json={"frame": frame(device, iso(10), evt="2", bat="9"), "key": "cle-dispositif"})
    assert low.status_code == 200
    events = sql("SELECT event_type::text AS t, payload->>'code' AS code FROM device_events WHERE device_id = $1", device)
    assert {"t": "batterie_faible", "code": "2"} in [dict(e) for e in events]


def test_relais_par_telephone_autorise_et_idempotent(client):
    headers, device, child_id = paired_child(client)
    _, stranger, _ = register(client, "inconnu")
    raw = frame(device, iso(120))
    first = client.post("/api/v1/device/v1/relay", headers=headers, json={"frames": [{"frame": raw}, {"frame": "x;y"}]}).json()["results"]
    assert first[0]["status"] == "accepted" and first[1] == {"status": "rejected", "reason": "field_count"}
    again = client.post("/api/v1/device/v1/relay", headers=headers, json={"frames": [{"frame": raw}]}).json()["results"]
    assert again[0]["status"] == "duplicate"
    # Un compte non autorisé ne peut ni injecter ni apprendre quoi que ce soit.
    forged = client.post("/api/v1/device/v1/relay", headers=stranger, json={"frames": [{"frame": frame(device, iso(30))}]}).json()["results"]
    assert forged == [{"status": "forbidden"}]
    assert client.post("/api/v1/device/v1/relay", json={"frames": [{"frame": raw}]}).status_code in (401, 403)
    rows = sql("SELECT source FROM positions WHERE child_id = $1::uuid", child_id)
    assert [r["source"] for r in rows] == ["relay"]


def test_commande_sans_canal_echoue_immediatement(client):
    headers, device, child_id = paired_child(client)
    fix = client.post(f"/api/v1/children/{child_id}/position/fix", headers=headers)
    assert fix.status_code == 202 and fix.json()["delivered"] is False and fix.json()["status"] == "FAILED"
    bad = client.post(f"/api/v1/children/{child_id}/commands", headers=headers, json={"code": "MODE", "valeur": "TURBO"})
    assert bad.status_code == 422
    reset = client.post(f"/api/v1/children/{child_id}/commands", headers=headers, json={"code": "RESET_USINE"})
    assert reset.status_code == 422  # non exposée


def test_commande_signee_accuse_et_expiration(client, monkeypatch):
    from app.core.config import settings
    from app.services import device_commands, device_protocol

    published = []
    monkeypatch.setattr(settings, "DEVICE_COMMAND_SIGNING_KEY", SIGNING_KEY)
    device_commands.set_test_publisher(lambda device_id, message: published.append((device_id, message)) or True)
    try:
        headers, device, child_id = paired_child(client)
        cmd = client.post(f"/api/v1/children/{child_id}/commands", headers=headers, json={"code": "MODE", "valeur": "STANDBY"}).json()
        assert cmd["status"] == "PENDING"
        target, message = published[-1]
        assert target == device and message["sig"] == device_protocol.sign_command(SIGNING_KEY, "MODE", "STANDBY")

        ack = {"id": cmd["id"], "cmd": "MODE", "ok": True, "detail": "mode change", "trackerId": device}
        forged = client.post("/api/v1/device/v1/ack", json={**ack, "sig": device_protocol.sign_ack("autre-cle", True, "mode change")})
        assert forged.status_code == 401
        wrong_device = client.post("/api/v1/device/v1/ack", json={**ack, "trackerId": new_serial(), "sig": device_protocol.sign_ack(SIGNING_KEY, True, "mode change")})
        assert wrong_device.status_code == 404
        good = client.post("/api/v1/device/v1/ack", json={**ack, "sig": device_protocol.sign_ack(SIGNING_KEY, True, "mode change")})
        assert good.status_code == 200 and good.json()["status"] == "SUCCESS"
        assert client.get(f"/api/v1/children/{child_id}/commands/{cmd['id']}", headers=headers).json()["status"] == "SUCCESS"

        late = client.post(f"/api/v1/children/{child_id}/commands", headers=headers, json={"code": "LOCALISER"}).json()
        sql("UPDATE device_commands SET created_at = now() - interval '5 minutes' WHERE id = $1::uuid", late["id"])

        from app.tasks.retrain import _expire_commands_async

        client.portal.call(_expire_commands_async)  # même boucle que le pool de l'application
        assert client.get(f"/api/v1/children/{child_id}/commands/{late['id']}", headers=headers).json()["status"] == "TIMEOUT"
    finally:
        device_commands.set_test_publisher(None)


# --- Constats de la revue indépendante (2026-10-21) ---------------------------------------


def test_verrouillage_de_connexion_independant_du_format_du_numero(client):
    phone = unique_phone()
    register(client, email=False, phone=phone)
    local = phone[4:]
    formats = [phone, local, f"{local[0]} {local[1:3]} {local[3:5]} {local[5:7]} {local[7:]}", f"00237{local}", f"+237 {local}"]
    for identifier in formats:
        r = client.post("/api/v1/auth/login", json={"identifier": identifier, "password": "Mauvais2026!"})
        assert r.status_code == 401
    blocked = client.post("/api/v1/auth/login", json={"identifier": f"+237-{local}", "password": PASSWORD})
    assert blocked.status_code == 429 and blocked.json()["detail"]["code"] == "rate_limited"


def _login_2fa(client, phone):
    login = client.post("/api/v1/auth/login", json={"identifier": phone, "password": PASSWORD}).json()
    return client.post("/api/v1/auth/2fa/send", json={"mfaToken": login["mfaToken"], "channel": "sms"}).json()


def test_renvoi_2fa_refuse_un_challenge_caduc(client, outbox):
    phone = unique_phone()
    _, headers, _ = register(client, phone=phone)
    assert client.put("/api/v1/users/me/2fa", headers=headers, json={"enabled": True, "password": PASSWORD}).status_code == 200

    used = _login_2fa(client, phone)
    assert client.post("/api/v1/auth/2fa/verify", json={"challengeToken": used["challengeToken"], "code": last_code(outbox)}).status_code == 200
    # Challenge consommé : il ne redonne jamais un « mot de passe déjà franchi ».
    replay = client.post("/api/v1/auth/2fa/resend", json={"challengeToken": used["challengeToken"]})
    assert replay.status_code == 400 and replay.json()["detail"]["code"] == "challenge_invalid"

    # Challenge en attente, puis mot de passe réinitialisé : il est invalidé.
    pending = _login_2fa(client, phone)
    pending_code = last_code(outbox)
    forgot = client.post("/api/v1/auth/forgot", json={"identifier": phone, "channel": "sms"}).json()
    reset = client.post("/api/v1/auth/reset-password", json={"challengeToken": forgot["challengeToken"], "code": last_code(outbox),
                                                             "newPassword": "Douala2026!x"})
    assert reset.status_code == 204
    assert client.post("/api/v1/auth/2fa/resend", json={"challengeToken": pending["challengeToken"]}).status_code == 400
    stale = client.post("/api/v1/auth/2fa/verify", json={"challengeToken": pending["challengeToken"], "code": pending_code})
    assert stale.status_code == 400 and stale.json()["detail"]["code"] == "otp_expired"


def test_telephone_jamais_verifie_par_un_code_e_mail(client, outbox):
    email, headers, _ = register(client)
    sql("UPDATE users SET email_verified_at = now() WHERE email = $1", email)
    r = request_phone_otp(client, headers, channel="email")
    assert r.status_code == 400 and r.json()["detail"]["code"] == "channel_not_allowed"
    assert not [m for c, _, m in outbox if c == "email"]
    assert client.get("/api/v1/users/me", headers=headers).json()["phoneVerified"] is False


def test_appairage_pin_limite_par_dispositif_et_non_reinitialise(client):
    from app.core.security import hash_password

    target = new_device(pin_hash=hash_password("K7Q2M9"))
    _, attacker, _ = register(client, "attaquant")
    own = new_device()
    for _ in range(4):
        assert pair(client, attacker, target, "AAAAAA").json()["detail"]["code"] == "pin_invalid"
    # Associer puis dissocier son propre boîtier ne remet pas le compteur à zéro.
    child_id = pair(client, attacker, own).json()["id"]
    assert client.delete(f"/api/v1/children/{child_id}/device", headers=attacker).status_code == 200
    assert client.put(f"/api/v1/children/{child_id}/device", headers=attacker, json={"deviceId": own}).status_code == 200
    assert pair(client, attacker, target, "BBBBBB").json()["detail"]["code"] == "pin_invalid"
    assert pair(client, attacker, target, "CCCCCC").status_code == 429

    # Plusieurs comptes ne cumulent pas leurs essais sur un même boîtier.
    shared = new_device(pin_hash=hash_password("K7Q2M9"))
    for i in range(5):
        _, someone, _ = register(client, f"essai{i}")
        assert pair(client, someone, shared, "AAAAAA").json()["detail"]["code"] == "pin_invalid"
    _, owner, _ = register(client, "proprietaire")
    assert pair(client, owner, shared, "K7Q2M9").status_code == 429


def test_echecs_d_inscription_comptes_malgre_le_409(client, monkeypatch):
    from app.core.config import settings

    phone = unique_phone()
    register(client, phone=phone)
    monkeypatch.setattr(settings, "REGISTER_MAX_PER_IP_PER_HOUR", 3)
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    ip = {"X-Forwarded-For": f"198.51.100.{uuid.uuid4().int % 250}"}
    payload = {"nom": "X", "telephone": phone, "password": PASSWORD}
    for _ in range(3):
        assert client.post("/api/v1/auth/register", headers=ip, json=payload).status_code == 409
    assert client.post("/api/v1/auth/register", headers=ip, json=payload).status_code == 429


def test_mot_de_passe_oublie_uniforme_si_le_fournisseur_echoue(client, monkeypatch):
    from app.core.config import settings
    from app.services import otp_delivery

    phone = unique_phone()
    register(client, email=False, phone=phone)
    monkeypatch.setattr(settings, "OTP_MODE", "live")

    def failing(channel, destination, message):
        raise otp_delivery.DeliveryFailed("refus du fournisseur")

    otp_delivery.set_test_sender(failing)
    try:
        known = client.post("/api/v1/auth/forgot", json={"identifier": phone, "channel": "sms"})
        unknown = client.post("/api/v1/auth/forgot", json={"identifier": unique_phone(), "channel": "sms"})
    finally:
        otp_delivery.set_test_sender(None)
    assert known.status_code == unknown.status_code == 200 and set(known.json()) == set(unknown.json())


def test_relais_reserve_aux_comptes_voyant_la_position(client):
    headers, device, child_id = paired_child(client)
    _, viewer, viewer_body = register(client, "proche")
    _, limited, limited_body = register(client, "voisin")
    for body, permissions in ((viewer_body, ["position_precise"]), (limited_body, ["etat_zone"])):
        sql("INSERT INTO secondary_access (child_id, user_id, permissions, status) VALUES ($1::uuid, $2, $3, 'actif')",
            child_id, body["user"]["id"], permissions)
    denied = client.post("/api/v1/device/v1/relay", headers=limited, json={"frames": [{"frame": frame(device, iso(90))}]}).json()["results"]
    assert denied == [{"status": "forbidden"}]
    allowed = client.post("/api/v1/device/v1/relay", headers=viewer, json={"frames": [{"frame": frame(device, iso(80))}]}).json()["results"]
    assert allowed[0]["status"] == "accepted"


def test_relais_trame_ecartee_reste_renvoyable(client):
    headers, device, child_id = paired_child(client)
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    raw = frame(device, future)
    first = client.post("/api/v1/device/v1/relay", headers=headers, json={"frames": [{"frame": raw}]}).json()["results"][0]
    if first["status"] == "rejected":
        pytest.skip("trame future refusée dès l'analyse : pas d'empreinte réservée")
    assert first["status"] == "duplicate"
    assert sql("SELECT count(*) AS n FROM device_relay_events WHERE device_id = $1", device)[0]["n"] == 0


def test_accuse_avec_identifiant_non_uuid(client, monkeypatch):
    from app.core.config import settings
    from app.services import device_protocol

    monkeypatch.setattr(settings, "DEVICE_COMMAND_SIGNING_KEY", SIGNING_KEY)
    headers, device, child_id = paired_child(client)
    ack = {"id": "pas-un-uuid", "cmd": "MODE", "ok": True, "detail": "x", "trackerId": device, "sig": device_protocol.sign_ack(SIGNING_KEY, True, "x")}
    assert client.post("/api/v1/device/v1/ack", json=ack).status_code == 404
    assert client.get(f"/api/v1/children/{child_id}/commands/pas-un-uuid", headers=headers).status_code == 404
