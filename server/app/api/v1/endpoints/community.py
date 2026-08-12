from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import WKTElement, functions as geo_func
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.crud.community import crud_community_report

router = APIRouter()


async def _report_dict(db, r):
    lat, lon = None, None
    if r.geom:
        st = await db.execute(geo_func.ST_AsText(r.geom))
        geom = st.scalar()
        if geom:
            parts = geom.replace("POINT(", "").replace(")", "").split()
            if len(parts) == 2:
                lon, lat = float(parts[0]), float(parts[1])
    return {
        "id": r.id,
        "description": r.description,
        "lat": lat,
        "lon": lon,
        "secteur": r.secteur,
        "createdAt": r.ts.isoformat(),
        "authorNom": None,
    }


@router.get("/reports")
async def list_reports(secteur: str = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    filters = {"moderated": False}
    if secteur:
        filters["secteur"] = secteur
    reports = await crud_community_report.list(db, **filters)
    return [await _report_dict(db, r) for r in reports]


@router.post("/reports", status_code=status.HTTP_201_CREATED)
async def create_report(req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lat = req.get("lat")
    lon = req.get("lon")
    geom = WKTElement(f"POINT({lon} {lat})", srid=4326) if lat is not None and lon is not None else None

    report = await crud_community_report.create(db, {
        "author_id": current_user.id,
        "description": req.get("description"),
        "geom": geom,
    })
    return await _report_dict(db, report)