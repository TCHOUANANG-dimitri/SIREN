from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import WKTElement, functions as geo_func
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.crud.place import crud_place, crud_place_schedule
from app.crud.child import crud_child

router = APIRouter()


def _place_dict(p, lat, lon):
    return {
        "id": p.id,
        "childId": p.child_id,
        "nom": p.nom,
        "lat": lat,
        "lon": lon,
        "radiusM": p.radius_m,
        "source": p.source,
        "visitCount": p.visit_count,
        "isNew": False,
        "icon": None,
    }


async def _extract_lat_lon(db, geom):
    if not geom:
        return 0, 0
    st = await db.execute(geo_func.ST_AsText(geom))
    geom_str = st.scalar()
    if geom_str:
        parts = geom_str.replace("POINT(", "").replace(")", "").split()
        if len(parts) == 2:
            try:
                return float(parts[1]), float(parts[0])
            except ValueError:
                pass
    return 0, 0


@router.get("/{child_id}/places")
async def list_places(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    places = await crud_place.list_by_child(db, child_id)
    result = []
    for p in places:
        lat, lon = await _extract_lat_lon(db, p.geom)
        result.append(_place_dict(p, lat, lon))
    return result


@router.post("/{child_id}/places", status_code=201)
async def create_place(child_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    child = await crud_child.get(db, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Enfant introuvable")

    lat = req.get("lat", 0)
    lon = req.get("lon", 0)
    radius = req.get("radiusM", req.get("radius", 50))

    place = await crud_place.create(db, {
        "child_id": child_id,
        "nom": req.get("nom"),
        "geom": WKTElement(f"POINT({lon} {lat})", srid=4326),
        "radius_m": radius,
    })

    schedule = req.get("schedule")
    if schedule:
        await crud_place_schedule.create(db, {
            "place_id": place.id,
            "jours": schedule.get("jours", []),
            "heure_debut": schedule.get("heureDebut"),
            "heure_fin": schedule.get("heureFin"),
        })

    return _place_dict(place, lat, lon)


@router.patch("/places/{place_id}")
async def patch_place(place_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    place = await crud_place.get(db, place_id)
    if not place:
        raise HTTPException(status_code=404, detail="Lieu introuvable")

    update = {}
    if "nom" in req:
        update["nom"] = req["nom"]
    if "radiusM" in req:
        update["radius_m"] = req["radiusM"]
    if "radius" in req:
        update["radius_m"] = req["radius"]

    updated = await crud_place.update(db, place, update)
    lat, lon = await _extract_lat_lon(db, updated.geom)
    return _place_dict(updated, lat, lon)
