"""
Endpoints de tracking (positions) - Frontend attend ces routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from geoalchemy2 import functions as geo_func
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.position import Position
from app.crud.child import crud_child

router = APIRouter()


async def _position_dict(db, p):
    lat, lon = 0, 0
    if p.geom:
        st = await db.execute(geo_func.ST_AsText(p.geom))
        geom = st.scalar()
        if geom:
            parts = geom.replace("POINT(", "").replace(")", "").split()
            if len(parts) == 2:
                try:
                    lon, lat = float(parts[0]), float(parts[1])
                except ValueError:
                    pass
    return {
        "lat": lat,
        "lon": lon,
        "speedKmh": p.speed_kmh,
        "accuracyM": p.accuracy_m,
        "heading": p.heading,
        "fixQuality": p.fix_quality,
        "battery": p.battery,
        "ts": p.ts.isoformat(),
    }


@router.get("/{child_id}/position")
async def get_position(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    result = await db.execute(
        select(Position).where(Position.child_id == child_id).order_by(desc(Position.ts)).limit(1)
    )
    pos = result.scalar_one_or_none()
    if not pos:
        raise HTTPException(status_code=204, detail="Aucune position disponible")

    return await _position_dict(db, pos)


@router.post("/{child_id}/position/fix", status_code=status.HTTP_202_ACCEPTED)
async def request_position_fix(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    return {"accepted": True, "message": "Demande de fix GPS envoyée au dispositif"}


@router.get("/{child_id}/zone-state")
async def get_zone_state(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    result = await db.execute(
        select(Position).where(Position.child_id == child_id).order_by(desc(Position.ts)).limit(1)
    )
    pos = result.scalar_one_or_none()
    if not pos:
        return {"inSafeZone": True, "zoneName": None}

    from app.crud.geofence import crud_geofence
    from app.crud.place import crud_place

    geofences = await crud_geofence.list_by_child(db, child_id)
    places = await crud_place.list_by_child(db, child_id)

    for gf in geofences:
        if gf.type == "interdit":
            within = await db.execute(geo_func.ST_Within(pos.geom, gf.geom))
            if within.scalar():
                return {"inSafeZone": False, "zoneName": gf.nom}

    for place in places:
        for schedule in place.schedules:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            if now.weekday() in schedule.jours:
                if schedule.heure_debut.hour <= now.hour <= schedule.heure_fin.hour:
                    d = await db.execute(geo_func.ST_Distance(pos.geom, place.geom))
                    if d.scalar() and d.scalar() <= place.radius_m:
                        return {"inSafeZone": True, "zoneName": place.nom}

    return {"inSafeZone": True, "zoneName": None}


@router.get("/{child_id}/history")
async def get_history(child_id: str, from_: str = None, to: str = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    from datetime import datetime, timezone
    query = select(Position).where(Position.child_id == child_id)
    if from_:
        query = query.where(Position.ts >= datetime.fromisoformat(from_.replace("Z", "+00:00")))
    if to:
        query = query.where(Position.ts <= datetime.fromisoformat(to.replace("Z", "+00:00")))
    query = query.order_by(desc(Position.ts)).limit(500)

    result = await db.execute(query)
    positions = result.scalars().all()

    return [await _position_dict(db, p) for p in positions]