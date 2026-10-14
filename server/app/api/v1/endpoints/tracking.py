"""
Positions d'un enfant. `position_precise` protège les coordonnées ; un
secondaire limité à `etat_zone` n'obtient QUE le nom de zone (CDC App §4.5 :
les coordonnées ne sont pas envoyées, pas seulement masquées).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access, log_secondary_access
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.geo import point_lat_lon
from app.core.timeutils import in_schedule, parse_iso_utc
from app.models.position import Position
from app.models.user import User

router = APIRouter()

HISTORY_MAX_POINTS = 500


def position_dict(p):
    lat_lon = point_lat_lon(p.geom)
    if lat_lon is None:
        return None
    lat, lon = lat_lon
    return {
        "lat": lat,
        "lon": lon,
        "speedKmh": p.speed_kmh,
        "accuracyM": p.accuracy_m,
        "heading": p.heading,
        "fixQuality": getattr(p.fix_quality, "value", p.fix_quality),
        "battery": p.battery,
        "ts": p.ts.isoformat(),
    }


async def _latest(db: AsyncSession, child_id: str):
    result = await db.execute(select(Position).where(Position.child_id == child_id).order_by(desc(Position.ts)).limit(1))
    return result.scalar_one_or_none()


@router.get("/{child_id}/position")
async def get_position(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require("position_precise")
    pos = await _latest(db, child_id)
    await log_secondary_access(db, access, "Position précise")
    data = position_dict(pos) if pos else None
    if data is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return data


@router.post("/{child_id}/position/fix", status_code=status.HTTP_202_ACCEPTED)
async def request_position_fix(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require("position_precise")
    # BLOQUANT (contrat Dispositif) : aucun canal descendant serveur → boîtier n'est
    # défini (SMS, commande en réponse à la télémétrie…). La demande est acceptée
    # mais ne peut pas encore être relayée au dispositif ; aucun crédit n'est débité.
    return {"accepted": True, "delivered": False}


@router.get("/{child_id}/zone-state")
async def get_zone_state(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_any("etat_zone", "position_precise")
    pos = await _latest(db, child_id)
    await log_secondary_access(db, access, "État de zone")
    if not pos:
        return {"inSafeZone": True, "inZone": False, "zoneName": None, "asOf": None}

    from geoalchemy2 import functions as geo_func
    from app.crud.geofence import crud_geofence
    from app.crud.place import crud_place

    for gf in await crud_geofence.list_by_child(db, child_id):
        if gf.type == "interdit":
            distance = (await db.execute(select(geo_func.ST_DistanceSphere(pos.geom, gf.geom)))).scalar()
            if distance is not None and distance <= (gf.radius_m or 100):
                return {"inSafeZone": False, "inZone": True, "zoneName": gf.nom, "asOf": pos.ts.isoformat()}

    for place in await crud_place.list_by_child(db, child_id):
        distance = (await db.execute(select(geo_func.ST_DistanceSphere(pos.geom, place.geom)))).scalar()
        if distance is not None and distance <= place.radius_m:
            return {"inSafeZone": True, "inZone": True, "zoneName": place.nom, "asOf": pos.ts.isoformat()}

    return {"inSafeZone": True, "inZone": False, "zoneName": None, "asOf": pos.ts.isoformat()}


@router.get("/{child_id}/history")
async def get_history(
    child_id: str,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    access = await get_child_access(db, current_user, child_id)
    access.require("historique")
    try:
        from_dt = parse_iso_utc(from_) if from_ else None
        to_dt = parse_iso_utc(to) if to else None
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates ISO 8601 avec fuseau attendues")

    query = select(Position).where(Position.child_id == child_id)
    if from_dt:
        query = query.where(Position.ts >= from_dt)
    if to_dt:
        query = query.where(Position.ts <= to_dt)
    result = await db.execute(query.order_by(desc(Position.ts)).limit(HISTORY_MAX_POINTS))
    await log_secondary_access(db, access, "Historique des trajets")
    return [d for d in (position_dict(p) for p in result.scalars().all()) if d is not None]
