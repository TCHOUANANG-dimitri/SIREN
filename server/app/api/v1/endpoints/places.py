from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2 import WKTElement
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.geo import point_lat_lon
from app.crud.place import crud_place, crud_place_schedule
from app.models.user import User
from app.schemas.child import ScheduleIn

router = APIRouter()


class PlaceCreate(BaseModel):
    nom: str = Field(..., min_length=1, max_length=150)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    radiusM: float = Field(50, ge=10, le=5000)
    schedule: ScheduleIn | None = None
    icon: str | None = None


class PlacePatch(BaseModel):
    nom: str | None = Field(None, min_length=1, max_length=150)
    radiusM: float | None = Field(None, ge=10, le=5000)
    isNew: bool | None = None


def _place_dict(p, fallback=None):
    lat_lon = point_lat_lon(p.geom) or fallback
    if lat_lon is None:
        return None
    lat, lon = lat_lon
    return {
        "id": p.id,
        "childId": p.child_id,
        "nom": p.nom,
        "lat": lat,
        "lon": lon,
        "radiusM": p.radius_m,
        "source": getattr(p.source, "value", p.source),
        "visitCount": p.visit_count,
        "isNew": False,
        "icon": None,
        "schedule": [
            {"jours": s.jours, "heureDebut": s.heure_debut.strftime("%H:%M"), "heureFin": s.heure_fin.strftime("%H:%M")}
            for s in (p.schedules or [])
        ],
    }


@router.get("/{child_id}/places")
async def list_places(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    # Les lieux révèlent domicile et école : réservés à qui voit la position précise.
    access.require_any("position_precise", "etat_zone")
    places = await crud_place.list_by_child(db, child_id)
    return [d for d in (_place_dict(p) for p in places) if d is not None]


@router.post("/{child_id}/places", status_code=status.HTTP_201_CREATED)
async def create_place(child_id: str, req: PlaceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    place = await crud_place.create(db, {
        "child_id": child_id,
        "nom": req.nom.strip(),
        "geom": WKTElement(f"POINT({req.lon} {req.lat})", srid=4326),
        "radius_m": req.radiusM,
    })
    if req.schedule:
        await crud_place_schedule.create(db, {
            "place_id": place.id,
            "jours": req.schedule.jours,
            "heure_debut": req.schedule.heureDebut,
            "heure_fin": req.schedule.heureFin,
        })
    await db.refresh(place, ["schedules"])
    return _place_dict(place, fallback=(req.lat, req.lon))


@router.patch("/places/{place_id}")
async def patch_place(place_id: str, req: PlacePatch, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    place = await crud_place.get(db, place_id)
    if not place:
        raise HTTPException(status_code=404, detail="Lieu introuvable")
    access = await get_child_access(db, current_user, place.child_id)
    access.require_principal()
    update = {}
    if req.nom is not None:
        update["nom"] = req.nom.strip()
    if req.radiusM is not None:
        update["radius_m"] = req.radiusM
    updated = await crud_place.update(db, place, update)
    return _place_dict(updated)
