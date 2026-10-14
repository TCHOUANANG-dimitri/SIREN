from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import WKTElement, functions as geo_func
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.crud.place import crud_place, crud_place_schedule
from app.crud.child import crud_child
from app.rules.declarative import MAX_PLACES_PER_CHILD, DEFAULT_PLACE_RADIUS_M

router = APIRouter()


def _place_dict(p, lat, lon):
    source = p.source.value if hasattr(p.source, "value") else str(p.source)
    return {
        "id": p.id,
        "childId": p.child_id,
        "nom": p.nom,
        "lat": lat,
        "lon": lon,
        "radiusM": float(p.radius_m or DEFAULT_PLACE_RADIUS_M),
        "source": source,
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


def _validate_schedule(schedule: dict):
    jours = schedule.get("jours", [])
    if not isinstance(jours, list) or not (1 <= len(jours) <= 7) or any(not isinstance(j, int) or j not in range(7) for j in jours):
        raise HTTPException(status_code=400, detail="schedule.jours doit être une liste de 0..6 (0=lundi)")
    for key in ("heureDebut", "heureFin"):
        if key not in schedule:
            raise HTTPException(status_code=400, detail=f"schedule.{key} manquant (format HH:MM)")
    try:
        from datetime import time as dtime
        hb = dtime.fromisoformat(str(schedule["heureDebut"])[:5])
        hf = dtime.fromisoformat(str(schedule["heureFin"])[:5])
    except ValueError:
        raise HTTPException(status_code=400, detail="schedule heures au format HH:MM")
    if not hb < hf:
        raise HTTPException(status_code=400, detail="heureDebut doit être avant heureFin")
    return {"jours": jours, "heure_debut": hb, "heure_fin": hf}


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

    existing = await crud_place.list_by_child(db, child_id)
    if len(existing) >= MAX_PLACES_PER_CHILD:
        raise HTTPException(status_code=400, detail=f"Limite de {MAX_PLACES_PER_CHILD} lieux par enfant atteinte")

    lat = req.get("lat", 0)
    lon = req.get("lon", 0)
    try:
        radius = float(req.get("radiusM", req.get("radius", DEFAULT_PLACE_RADIUS_M)))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="radiusM invalide")
    if radius < 10:
        raise HTTPException(status_code=400, detail="radiusM minimum 10 m")

    place = await crud_place.create(db, {
        "child_id": child_id,
        "nom": req.get("nom"),
        "geom": WKTElement(f"POINT({lon} {lat})", srid=4326),
        "radius_m": radius,
    })

    schedule = req.get("schedule")
    if schedule:
        clean = _validate_schedule(schedule)
        await crud_place_schedule.create(db, {
            "place_id": place.id,
            **clean,
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
        try:
            radius = float(req["radiusM"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="radiusM invalide")
        if radius < 10:
            raise HTTPException(status_code=400, detail="radiusM minimum 10 m")
        update["radius_m"] = radius
    if "radius" in req:
        try:
            radius = float(req["radius"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="radius invalide")
        if radius < 10:
            raise HTTPException(status_code=400, detail="radius minimum 10 m")
        update["radius_m"] = radius

    updated = await crud_place.update(db, place, update)
    lat, lon = await _extract_lat_lon(db, updated.geom)
    return _place_dict(updated, lat, lon)
