"""
Ingestion dispositif IoT — authentification par (deviceId, key).

Contrat v1 (côté boîtier, à valider avec le pôle Dispositif) : voir
docs/contrats/device-server.md. Horodatages ISO 8601 avec fuseau, vitesse km/h,
batterie %, IMU libre (`accMax` en m/s² reconnu par le scoring).
"""
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from geoalchemy2 import WKTElement
from sqlalchemy import select
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
from app.services.push import send_alert_push
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

    now = datetime.now(timezone.utc)
    previous = await crud_position.get_latest(db, child.id)

    existing_ts = []
    candidate_ts = [p.ts for p in req.batch]
    if candidate_ts:
        stored = await db.execute(
            select(Position.ts).where(Position.child_id == child.id, Position.ts.in_(list(_parse_all(candidate_ts))))
        )
        existing_ts = list(stored.scalars().all())
    triage = triage_batch(candidate_ts, existing_ts, now, settings.TELEMETRY_MAX_FUTURE_SKEW_S)
    if triage.rejected:
        logger.warning("Télémétrie : %s point(s) rejeté(s) (horodatage invalide ou futur) pour %s", triage.rejected, req.deviceId)

    # L'état du boîtier est mis à jour même si le lot ne contient que des doublons.
    last_battery = next((p.battery for p in reversed(req.batch) if p.battery is not None), None)
    device_update = {"last_seen": now, "online": True}
    if last_battery is not None:
        device_update["battery"] = last_battery
    await crud_device.update(db, device, device_update)

    inserted = []
    for accepted in triage.accepted:
        point = req.batch[accepted.index]
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
        )
        db.add(position)
        inserted.append((position, point))
    if not inserted:
        return DeviceTelemetryResponse(ack=True, configVersion=device.config_version)
    await db.flush()

    latest_position, latest_point = inserted[-1]
    if not should_rescore(latest_position.ts, previous.ts if previous else None):
        # Lot en retard : historique complété, score présent inchangé.
        return DeviceTelemetryResponse(ack=True, configVersion=device.config_version)

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

    return DeviceTelemetryResponse(ack=True, configVersion=device.config_version)


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
KNOWN_EVENTS = {"removal", "power_on", "power_off", "low_battery", "charging"}


@router.post("/v1/event")
async def ingest_event(req: DeviceEventRequest, db: AsyncSession = Depends(get_db)):
    device = await verify_device(req.deviceId, req.key, db)
    from app.crud.device_event import crud_device_event

    if req.type not in KNOWN_EVENTS:
        logger.warning("Événement dispositif inconnu « %s » (%s)", req.type, device.device_id)
    await crud_device_event.create(db, {"device_id": req.deviceId, "event_type": req.type})
    if req.type == "power_off":
        await crud_device.update(db, device, {"online": False})
    # BLOQUANT (IA / produit) : la réaction à un « removal » (retrait du boîtier)
    # doit être définie dans le moteur de fusion ; l'événement est seulement journalisé.
    return DeviceEventResponse(ack=True)
