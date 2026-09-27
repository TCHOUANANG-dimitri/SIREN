"""
Signalements de quartier (CDC App §4.6). Un signalement n'est PAS public par
défaut : il n'est listé qu'une fois modéré (moderated = vrai). Son auteur n'est
jamais exposé aux autres utilisateurs.
"""
from fastapi import APIRouter, Depends, status
from geoalchemy2 import WKTElement
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.geo import point_lat_lon
from app.crud.community import crud_community_report
from app.models.user import User

router = APIRouter()


class ReportCreate(BaseModel):
    description: str = Field(..., min_length=10, max_length=1000)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


def _report_dict(r, fallback=None):
    lat_lon = point_lat_lon(r.geom) or fallback
    return {
        "id": r.id,
        "description": r.description,
        "lat": lat_lon[0] if lat_lon else None,
        "lon": lat_lon[1] if lat_lon else None,
        "secteur": r.secteur,
        "createdAt": r.ts.isoformat(),
        "authorNom": None,
        "moderated": bool(r.moderated),
    }


@router.get("/reports")
async def list_reports(secteur: str | None = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Correctif : le filtre précédent (moderated=False) ne publiait QUE les signalements non modérés.
    reports = await crud_community_report.list(db, moderated=True, secteur=secteur)
    return [_report_dict(r) for r in reports]


@router.post("/reports", status_code=status.HTTP_201_CREATED)
async def create_report(req: ReportCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    report = await crud_community_report.create(db, {
        "author_id": current_user.id,
        "description": req.description.strip(),
        "geom": WKTElement(f"POINT({req.lon} {req.lat})", srid=4326),
    })
    # En attente de modération : visible par son auteur dans la réponse, pas dans le fil.
    return _report_dict(report, fallback=(req.lat, req.lon))
