from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2 import WKTElement
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.geo import point_lat_lon
from app.crud.geofence import crud_geofence
from app.models.user import User

router = APIRouter()


class GeofenceCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=150)
    type: str = Field("interdit", pattern="^(autorise|interdit)$")
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    radiusM: float = Field(100, ge=10, le=50000)
    notifyOnEnter: bool = True
    notifyOnExit: bool = True


class GeofencePatch(BaseModel):
    nom: str | None = Field(None, min_length=1, max_length=150)
    type: str | None = Field(None, pattern="^(autorise|interdit)$")
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    radiusM: float | None = Field(None, ge=10, le=50000)
    notifyOnEnter: bool | None = None
    notifyOnExit: bool | None = None


def _geofence_dict(f, fallback=None):
    # Périmètre circulaire : centre (POINT) + rayon. Les polygones (CDC « quartier »)
    # ne sont pas encore exposés par ce contrat v1.
    lat_lon = point_lat_lon(f.geom) or fallback
    if lat_lon is None:
        return None
    lat, lon = lat_lon
    return {
        "id": f.id,
        "childId": f.child_id,
        "nom": f.nom,
        "type": getattr(f.type, "value", f.type),
        "lat": lat,
        "lon": lon,
        "radiusM": f.radius_m,
        "notifyOnEnter": f.notify_enter,
        "notifyOnExit": f.notify_exit,
    }


async def _owned_geofence(db, current_user, geofence_id):
    fence = await crud_geofence.get(db, geofence_id)
    if not fence:
        raise HTTPException(status_code=404, detail="Périmètre introuvable")
    access = await get_child_access(db, current_user, fence.child_id)
    access.require_principal()
    return fence


@router.get("/{child_id}/geofences")
async def list_geofences(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_any("position_precise", "etat_zone")
    fences = await crud_geofence.list_by_child(db, child_id)
    return [d for d in (_geofence_dict(f) for f in fences) if d is not None]


@router.post("/{child_id}/geofences", status_code=status.HTTP_201_CREATED)
async def create_geofence(child_id: str, req: GeofenceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    fence = await crud_geofence.create(db, {
        "child_id": child_id,
        "nom": req.nom.strip(),
        "type": req.type,
        "geom": WKTElement(f"POINT({req.lon} {req.lat})", srid=4326),
        "radius_m": req.radiusM,
        "notify_enter": req.notifyOnEnter,
        "notify_exit": req.notifyOnExit,
    })
    return _geofence_dict(fence, fallback=(req.lat, req.lon))


@router.patch("/geofences/{geofence_id}")
async def patch_geofence(geofence_id: str, req: GeofencePatch, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    fence = await _owned_geofence(db, current_user, geofence_id)
    update = {}
    if req.nom is not None:
        update["nom"] = req.nom.strip()
    if req.type is not None:
        update["type"] = req.type
    if req.radiusM is not None:
        update["radius_m"] = req.radiusM
    if req.notifyOnEnter is not None:
        update["notify_enter"] = req.notifyOnEnter
    if req.notifyOnExit is not None:
        update["notify_exit"] = req.notifyOnExit
    if req.lat is not None and req.lon is not None:
        update["geom"] = WKTElement(f"POINT({req.lon} {req.lat})", srid=4326)
    updated = await crud_geofence.update(db, fence, update)
    fallback = (req.lat, req.lon) if req.lat is not None and req.lon is not None else None
    return _geofence_dict(updated, fallback=fallback)


@router.delete("/geofences/{geofence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_geofence(geofence_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    fence = await _owned_geofence(db, current_user, geofence_id)
    await crud_geofence.delete(db, fence.id)
    return None
