from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import functions as geo_func
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.crud.alert import crud_alert
from app.crud.child import crud_child

router = APIRouter()


async def _alert_dict(db, a):
    lat, lon = None, None
    if a.geom:
        st = await db.execute(geo_func.ST_AsText(a.geom))
        geom = st.scalar()
        if geom:
            parts = geom.replace("POINT(", "").replace(")", "").split()
            if len(parts) == 2:
                lon, lat = float(parts[0]), float(parts[1])
    return {
        "id": a.id,
        "childId": a.child_id,
        "level": a.level,
        "score": a.score,
        "reasons": (a.reasons or {}).get("reasons", []),
        "lat": lat,
        "lon": lon,
        "status": a.status,
        "createdAt": a.created_at.isoformat(),
        "resolvedAt": a.resolved_at.isoformat() if a.resolved_at else None,
    }


@router.get("/{child_id}/alerts")
async def list_alerts(child_id: str, status: str = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    alerts = await crud_alert.list_by_child(db, child_id, status)
    return [await _alert_dict(db, a) for a in alerts]


@router.get("/alerts")
async def list_all_alerts(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.crud.child import crud_child
    children = await crud_child.list_by_user(db, current_user.id, current_user.role)
    child_ids = [c.id for c in children]
    if not child_ids:
        return []
    alerts = await crud_alert.list_by_user(db, child_ids)
    return [await _alert_dict(db, a) for a in alerts]


@router.patch("/alerts/{alert_id}")
async def patch_alert(alert_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    alert = await crud_alert.get(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte introuvable")

    from datetime import datetime, timezone
    update = {}
    if req.get("status") in ("resolue",):
        update["status"] = req["status"]
        update["resolved_at"] = datetime.now(timezone.utc)

    updated = await crud_alert.update(db, alert, update)
    return await _alert_dict(db, updated)