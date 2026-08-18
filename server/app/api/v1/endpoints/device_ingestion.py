"""
Ingestion dispositif IoT - auth par clé de dispositif.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import WKTElement
from app.core.database import get_db
from app.core.security import verify_password
from app.crud.device import crud_device
from app.crud.child import crud_child
from app.crud.param_pack import crud_param_pack
from app.crud.position import crud_position
from app.models.position import Position
from app.schemas.device import (
    DeviceTelemetryRequest, DeviceTelemetryResponse,
    DevicePackQuery, DevicePackResponse,
    DeviceEventRequest, DeviceEventResponse,
)
from app.services.scoring import compute_risk_score, persist_risk_score
from app.services.websocket_manager import publish_position, publish_risk
from app.services.push import send_alert_push
from datetime import datetime, timezone

router = APIRouter()


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

    last_position = None
    for point in req.batch:
        ts = datetime.fromisoformat(point.ts.replace("Z", "+00:00")) if point.ts else datetime.now(timezone.utc)

        position = Position(
            child_id=child.id,
            geom=WKTElement(f"POINT({point.lon} {point.lat})", srid=4326),
            speed_kmh=point.speed,
            accuracy_m=point.accuracy,
            heading=point.heading,
            battery=point.battery,
            imu_data=point.imu,
            ts=ts,
        )
        db.add(position)
        last_position = position

    if last_position:
        await db.flush()
        await publish_position(child.id, {
            "lat": req.batch[-1].lat,
            "lon": req.batch[-1].lon,
            "speedKmh": req.batch[-1].speed,
            "ts": req.batch[-1].ts,
        })

        previous = await crud_position.get_latest(db, child.id) if len(req.batch) == 1 else None
        result = await compute_risk_score(db, child, last_position, previous)
        risk = await persist_risk_score(db, child.id, result)
        await publish_risk(child.id, {
            "score": result.score,
            "state": result.state,
            "reasons": result.reasons,
        })

        if result.state in ("prealerte", "urgence"):
            from app.crud.alert import crud_alert
            alert = await crud_alert.create(db, {
                "child_id": child.id,
                "level": "urgence" if result.state == "urgence" else "prealerte",
                "score": result.score,
                "reasons": {"reasons": result.reasons},
                "geom": last_position.geom,
                "status": "active",
            })
            await send_alert_push(db, alert, child.prenom)

    return DeviceTelemetryResponse(ack=True, configVersion=device.config_version)


@router.get("/v1/pack")
async def get_pack(deviceId: str, key: str, have: int = None, db: AsyncSession = Depends(get_db)):
    device = await verify_device(deviceId, key, db)
    child = await crud_child.get_by_device(db, deviceId)

    if not child:
        raise HTTPException(status_code=404, detail="Aucun enfant associé")

    latest_pack = await crud_param_pack.get_latest(db, child.id)
    if not latest_pack:
        raise HTTPException(status_code=404, detail="Aucun pack disponible")

    if have and have >= latest_pack.version:
        return Response(status_code=304)

    return {
        "version": latest_pack.version,
        "payload": latest_pack.payload,
    }


@router.post("/v1/event")
async def ingest_event(req: DeviceEventRequest, db: AsyncSession = Depends(get_db)):
    device = await verify_device(req.deviceId, req.key, db)
    from app.crud.device_event import crud_device_event
    await crud_device_event.create(db, {
        "device_id": req.deviceId,
        "event_type": req.type,
    })
    return DeviceEventResponse(ack=True)