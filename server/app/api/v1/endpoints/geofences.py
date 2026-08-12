from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import WKTElement, functions as geo_func
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.crud.geofence import crud_geofence
from app.crud.child import crud_child

router = APIRouter()


def _geofence_dict(f, lat, lon):
    return {
        "id": f.id,
        "childId": f.child_id,
        "nom": f.nom,
        "type": f.type,
        "lat": lat,
        "lon": lon,
        "radiusM": 100,
        "notifyOnEnter": f.notify_enter,
        "notifyOnExit": f.notify_exit,
    }


async def _extract_lat_lon(db, geom):
    if not geom:
        return 0, 0
    st = await db.execute(geo_func.ST_AsText(geom))
    geom_str = st.scalar()
    if geom_str:
        parts = geom_str.replace("POINT(", "").replace(")", "").split()
        if len(parts) >= 2:
            try:
                return float(parts[1]), float(parts[0])
            except ValueError:
                pass
    return 0, 0


@router.get("/{child_id}/geofences")
async def list_geofences(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    fences = await crud_geofence.list_by_child(db, child_id)
    result = []
    for f in fences:
        lat, lon = await _extract_lat_lon(db, f.geom)
        result.append(_geofence_dict(f, lat, lon))
    return result


@router.post("/{child_id}/geofences", status_code=status.HTTP_201_CREATED)
async def create_geofence(child_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    lat = req.get("lat", 0)
    lon = req.get("lon", 0)
    radius = req.get("radiusM", 100)

    fence = await crud_geofence.create(db, {
        "child_id": child_id,
        "nom": req.get("nom"),
        "type": req.get("type", "interdit"),
        "geom": WKTElement(f"POINT({lon} {lat})", srid=4326),
        "notify_enter": req.get("notifyOnEnter", req.get("notify_enter", True)),
        "notify_exit": req.get("notifyOnExit", req.get("notify_exit", True)),
    })
    return _geofence_dict(fence, lat, lon)


@router.patch("/geofences/{geofence_id}")
async def patch_geofence(geofence_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    fence = await crud_geofence.get(db, geofence_id)
    if not fence:
        raise HTTPException(status_code=404, detail="Périmètre introuvable")

    update = {}
    if "nom" in req:
        update["nom"] = req["nom"]
    if "type" in req:
        update["type"] = req["type"]
    if "radiusM" in req:
        update["radius_m"] = req["radiusM"]
    if "notifyOnEnter" in req:
        update["notify_enter"] = req["notifyOnEnter"]
    if "notifyOnExit" in req:
        update["notify_exit"] = req["notifyOnExit"]

    updated = await crud_geofence.update(db, fence, update)
    lat, lon = await _extract_lat_lon(db, updated.geom)
    return _geofence_dict(updated, lat, lon)


@router.delete("/geofences/{geofence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_geofence(geofence_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    deleted = await crud_geofence.delete(db, geofence_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Périmètre introuvable")
    return {"deleted": True}