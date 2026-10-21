"""
Ingestion dispositif IoT — authentification par (deviceId, key).

Contrat v1 (côté boîtier, à valider avec le pôle Dispositif) : voir
docs/contrats/device-server.md. Horodatages ISO 8601 avec fuseau, vitesse km/h,
batterie %, IMU libre (`accMax` en m/s² reconnu par le scoring).
"""
from datetime import datetime, timedelta, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from geoalchemy2 import WKTElement
from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password
from app.crud.alert import crud_alert
from app.crud.child import crud_child
from app.crud.device import crud_device
from app.crud.param_pack import crud_param_pack
from app.crud.position import crud_position
from app.crud.risk import crud_risk
from app.models.position import Position
from app.schemas.device import (
    DeviceEventRequest,
    DeviceEventResponse,
    DeviceTelemetryRequest,
    DeviceTelemetryResponse,
)
from app.services.push import send_alert_push, send_low_battery_push
from app.services.scoring import compute_risk_score, persist_risk_score
from app.services.telemetry import fix_quality_for, should_raise_alert, should_rescore, triage_batch
from app.services.websocket_manager import publish_alert, publish_position, publish_risk

router = APIRouter()
logger = logging.getLogger("siren.ingestion")

# Précision au-delà de laquelle un point n'est pas « GPS récent » (m) — aligné sur l'app.
MAX_ACCURATE_RADIUS_M = 100


async def verify_device(device_id: str, key: str, db: AsyncSession):
    device = await crud_device.get_by_id(db, device_id)
    if not device or not verify_password(key, device.secret_key_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentification dispositif échouée")
    return device


@router.post("/v1/telemetry")
async def ingest_telemetry(req: DeviceTelemetryRequest, db: AsyncSession = Depends(get_db)):
    device = await verify_device(req.deviceId, req.key, db)
    child = await crud_child.get_by_device(db, req.deviceId)
    if not child:
        raise HTTPException(status_code=404, detail="Aucun enfant associé à ce dispositif")
    await ingest_points(db, device, child, req.batch)
    return DeviceTelemetryResponse(ack=True, configVersion=device.config_version)


async def ingest_points(db: AsyncSession, device, child, batch: list, source: str = "device", dedup_window_s: int = 0) -> int:
    """
    Cœur d'ingestion commun (télémétrie JSON, trame « ; » HTTP, relais téléphone).
    Écrit les points nouveaux, met à jour le boîtier, recalcule le score et alerte.
    `dedup_window_s` > 0 : un point à ± N s d'une position existante est un doublon
    (protocole §6 : une même trame peut arriver par deux canaux). Renvoie le nombre de points écrits.
    """
    now = datetime.now(timezone.utc)
    if dedup_window_s:
        # Sérialise les écritures d'un même dispositif (pg_advisory_xact_lock, protocole §6).
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"device:{device.device_id}"})
    previous = await crud_position.get_latest(db, child.id)

    existing_ts = []
    candidate_ts = [p.ts for p in batch]
    parsed = list(_parse_all(candidate_ts))
    if parsed:
        if dedup_window_s:
            window = timedelta(seconds=dedup_window_s)
            for ts in parsed:
                near = await db.execute(
                    select(Position.ts).where(Position.child_id == child.id, Position.ts.between(ts - window, ts + window)).limit(1)
                )
                if near.scalar_one_or_none() is not None:
                    existing_ts.append(ts)
        else:
            stored = await db.execute(select(Position.ts).where(Position.child_id == child.id, Position.ts.in_(parsed)))
            existing_ts = list(stored.scalars().all())
    triage = triage_batch(candidate_ts, existing_ts, now, settings.TELEMETRY_MAX_FUTURE_SKEW_S)
    if triage.rejected:
        logger.warning("Télémétrie : %s point(s) rejeté(s) (horodatage invalide ou futur) pour %s", triage.rejected, device.device_id)

    # L'état du boîtier est mis à jour même si le lot ne contient que des doublons
    # (un relais ne prouve pas que le boîtier est joignable : seule la batterie est reprise).
    last_battery = next((p.battery for p in reversed(batch) if p.battery is not None), None)
    device_update = {"last_seen": now, "online": True} if source == "device" else {}
    if last_battery is not None:
        device_update["battery"] = last_battery
    if device_update:
        await crud_device.update(db, device, device_update)

    inserted = []
    for accepted in triage.accepted:
        point = batch[accepted.index]
        position = Position(
            child_id=child.id,
            geom=WKTElement(f"POINT({point.lon} {point.lat})", srid=4326),
            speed_kmh=point.speed,
            accuracy_m=point.accuracy,
            heading=point.heading,
            battery=point.battery,
            imu_data=point.imu,
            fix_quality=fix_quality_for(point.accuracy, MAX_ACCURATE_RADIUS_M),
            ts=accepted.ts,
            source=source,
        )
        db.add(position)
        inserted.append((position, point))
    if not inserted:
        return 0
    await db.flush()

    latest_position, latest_point = inserted[-1]
    if not should_rescore(latest_position.ts, previous.ts if previous else None):
        # Lot en retard : historique complété, score présent inchangé.
        return len(inserted)

    await publish_position(child.id, {
        "lat": latest_point.lat,
        "lon": latest_point.lon,
        "speedKmh": latest_point.speed,
        "accuracyM": latest_point.accuracy,
        "heading": latest_point.heading,
        "fixQuality": latest_position.fix_quality,
        "battery": latest_point.battery,
        "ts": latest_position.ts.isoformat(),
    })

    last_risk = await crud_risk.get_latest(db, child.id)
    previous_state = last_risk.state if last_risk else None
    result = await compute_risk_score(db, child, latest_position, previous)
    risk = await persist_risk_score(db, child, result)
    await publish_risk(child.id, {"score": result.score, "state": result.state, "reasons": result.reasons, "ts": risk.ts.isoformat()})

    if should_raise_alert(previous_state, result.state):
        alert = await crud_alert.create(db, {
            "child_id": child.id,
            "level": "urgence" if result.state == "urgence" else "prealerte",
            "score": result.score,
            "reasons": {"reasons": result.reasons},
            "geom": latest_position.geom,
            "status": "active",
        })
        await publish_alert(child.id, {
            "id": alert.id,
            "childId": child.id,
            "level": alert.level,
            "score": alert.score,
            "reasons": result.reasons,
            "status": "active",
            "createdAt": alert.created_at.isoformat(),
        })
        await send_alert_push(db, alert, child.prenom)

    return len(inserted)


def _parse_all(values):
    from app.core.timeutils import parse_iso_utc

    for value in values:
        try:
            yield parse_iso_utc(value)
        except (ValueError, AttributeError):
            continue


@router.get("/v1/pack")
async def get_pack(deviceId: str, key: str, have: int | None = None, db: AsyncSession = Depends(get_db)):
    device = await verify_device(deviceId, key, db)
    child = await crud_child.get_by_device(db, deviceId)
    if not child:
        raise HTTPException(status_code=404, detail="Aucun enfant associé")

    latest_pack = await crud_param_pack.get_latest(db, child.id)
    payload = dict(latest_pack.payload) if latest_pack else {}
    # Les réglages parent (énergie, sensibilité) voyagent avec le pack.
    payload["deviceConfig"] = {
        "version": device.config_version,
        "energyMode": device.energy_mode,
        "sensitivity": device.sensitivity,
    }
    version = max(latest_pack.version if latest_pack else 0, device.config_version)
    if have is not None and have >= version:
        return Response(status_code=304)
    return {"version": version, "payload": payload}


# Types d'événements reconnus — à figer avec le pôle Dispositif (CDC Dispositif §2).
from app.models.device_event import DEVICE_EVENT_CODES, DeviceEventType  # noqa: E402

KNOWN_EVENTS = set(DEVICE_EVENT_CODES)


@router.post("/v1/event")
async def ingest_event(req: DeviceEventRequest, db: AsyncSession = Depends(get_db)):
    device = await verify_device(req.deviceId, req.key, db)
    from app.crud.device_event import crud_device_event

    if req.type not in KNOWN_EVENTS:
        logger.warning("Événement dispositif inconnu « %s » (%s)", req.type, device.device_id)
    # Le type PostgreSQL device_event_type n'accepte que des valeurs connues :
    # un code inconnu est conservé dans payload sous « autre » (jamais perdu, jamais d'erreur 500).
    stored = DEVICE_EVENT_CODES.get(req.type, DeviceEventType.AUTRE)
    payload = None if req.type in DEVICE_EVENT_CODES else {"type": req.type[:50]}
    await crud_device_event.create(db, {"device_id": req.deviceId, "event_type": stored, "payload": payload})
    if req.type == "power_off":
        await crud_device.update(db, device, {"online": False})
    if req.type == "low_battery":
        # Canal « information » (CDC App §5) ; seuil décidé par le boîtier (C18).
        from app.crud.child import crud_child

        child = await crud_child.get_by_device(db, device.device_id)
        if child is not None:
            await send_low_battery_push(db, child)
    # BLOQUANT (IA / produit) : la réaction à un « removal » (retrait du boîtier)
    # doit être définie dans le moteur de fusion ; l'événement est seulement journalisé.
    return DeviceEventResponse(ack=True)


# --- Protocole traceur (docs/transition-données-serveur.pdf) -------------------------------

from app.core.dependencies import get_current_user  # noqa: E402
from app.core.authz import get_child_access  # noqa: E402
from app.core.errors import api_error  # noqa: E402
from app.models.device_link import DeviceRelayEvent  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.device import DeviceAckRequest, DeviceFrameRequest, DeviceTelemetryPoint, RelayRequest  # noqa: E402
from app.services import device_commands, device_protocol  # noqa: E402
from app.services import rate_limit  # noqa: E402
from app.services.websocket_manager import publish_command_update  # noqa: E402

# Protocole §6 : une même trame peut arriver par deux canaux ; fenêtre de dédoublonnage.
FRAME_DEDUP_WINDOW_S = 2


def frame_point(frame: device_protocol.Frame) -> DeviceTelemetryPoint:
    return DeviceTelemetryPoint(
        lat=frame.lat, lon=frame.lon, speed=frame.speed_kmh, battery=frame.battery,
        accuracy=None, heading=frame.heading, imu=None, ts=frame.ts.isoformat(),
    )


async def record_frame_event(db: AsyncSession, device, child, frame: device_protocol.Frame) -> None:
    event = frame.event
    if event is None:
        return
    from app.crud.device_event import crud_device_event

    payload = {"code": frame.event_code, "name": event["name"], "value": frame.event_value, "threshold": frame.event_threshold}
    await crud_device_event.create(db, {"device_id": device.device_id, "event_type": DeviceEventType(event["stored"]), "payload": payload})
    if event["name"] == "low_battery" and child is not None:
        await send_low_battery_push(db, child)


async def ingest_frame(db: AsyncSession, device, child, frame: device_protocol.Frame, source: str) -> int:
    written = await ingest_points(db, device, child, [frame_point(frame)], source=source, dedup_window_s=FRAME_DEDUP_WINDOW_S)
    if written:
        await record_frame_event(db, device, child, frame)
    return written


@router.post("/v1/frame")
async def ingest_raw_frame(req: DeviceFrameRequest, db: AsyncSession = Depends(get_db)):
    """Webhook HTTP de secours (protocole §5) : trame « ; » + clé du dispositif."""
    try:
        frame = device_protocol.parse_frame(req.frame)
    except device_protocol.FrameError as error:
        raise api_error(422, "frame_invalid", "Trame refusée", {"reason": error.reason})
    device = await verify_device(frame.tracker_id, req.key, db)
    child = await crud_child.get_by_device(db, device.device_id)
    if not child:
        raise HTTPException(status_code=404, detail="Aucun enfant associé à ce dispositif")
    written = await ingest_frame(db, device, child, frame, "device")
    return {"ack": True, "duplicate": written == 0, "configVersion": device.config_version}


@router.post("/v1/relay")
async def relay_frames(req: RelayRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Trames stockées hors ligne par le téléphone puis relayées.
    - seul un compte autorisé sur l'enfant associé au traceur peut relayer : le
      parent principal ou un proche ayant le droit « position_precise » (une trame
      relayée déclenche score, alertes et notifications) ;
    - idempotent : une trame déjà relayée (empreinte SHA-256) ou déjà reçue
      directement (± 2 s) n'est jamais écrite deux fois ;
    - positions marquées source=relay (la trame n'est pas signée : D-08).
    Réponse par trame : accepted | duplicate | rejected (motif) | forbidden.
    """
    await rate_limit.hit(db, "relay", current_user.id, 60, 60)
    results = []
    for item in req.frames:
        try:
            frame = device_protocol.parse_frame(item.frame)
        except device_protocol.FrameError as error:
            results.append({"status": "rejected", "reason": error.reason})
            continue
        device = await crud_device.get_by_id(db, frame.tracker_id)
        child = await crud_child.get_by_device(db, frame.tracker_id) if device else None
        if child is None:
            results.append({"status": "forbidden"})
            continue
        try:
            access = await get_child_access(db, current_user, child.id)
        except HTTPException:
            results.append({"status": "forbidden"})
            continue
        if not access.has("position_precise"):
            results.append({"status": "forbidden"})
            continue
        fingerprint = device_protocol.frame_fingerprint(item.frame)
        claimed = await db.execute(
            pg_insert(DeviceRelayEvent)
            .values(device_id=device.device_id, event_id=fingerprint, relayed_by=current_user.id)
            .on_conflict_do_nothing(constraint="uq_device_relay_event")
            .returning(DeviceRelayEvent.id)
        )
        if claimed.scalar_one_or_none() is None:
            results.append({"status": "duplicate", "eventId": fingerprint})
            continue
        written = await ingest_frame(db, device, child, frame, "relay")
        if not written:
            # Rien d'écrit (doublon d'une trame directe, ou point écarté par le tri, ex.
            # horodatage futur) : l'empreinte est libérée pour qu'un renvoi reste possible.
            await db.execute(delete(DeviceRelayEvent).where(DeviceRelayEvent.device_id == device.device_id, DeviceRelayEvent.event_id == fingerprint))
        results.append({"status": "accepted" if written else "duplicate", "eventId": fingerprint})
    return {"results": results}


@router.post("/v1/ack")
async def command_ack(req: DeviceAckRequest, db: AsyncSession = Depends(get_db)):
    """Accusé du traceur : refusé s'il n'est pas signé avec la clé partagée (protocole §7.4)."""
    if not device_protocol.verify_ack(settings.DEVICE_COMMAND_SIGNING_KEY, req.ok, req.detail, req.sig):
        raise api_error(401, "signature_invalid", "Accusé mal signé")
    command = await device_commands.apply_ack(db, command_id=req.id, tracker_id=req.trackerId, cmd=req.cmd, ok=req.ok, detail=req.detail)
    if command is None:
        raise api_error(404, "command_not_found", "Commande inconnue")
    await publish_command_update(command.child_id, device_commands.command_dict(command))
    return {"ack": True, "status": command.status}
