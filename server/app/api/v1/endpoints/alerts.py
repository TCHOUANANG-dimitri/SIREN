from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.geo import point_lat_lon
from app.crud.alert import crud_alert
from app.crud.child import crud_child
from app.models.user import User

router = APIRouter()

# Une alerte ne revient jamais à « active » depuis l'app.
ALLOWED_TRANSITIONS = {
    "active": {"acquittee", "fausse", "resolue"},
    "acquittee": {"fausse", "resolue"},
    "fausse": set(),
    "resolue": set(),
}


class AlertPatch(BaseModel):
    status: str = Field(..., pattern="^(acquittee|fausse|resolue)$")


def alert_dict(a):
    lat_lon = point_lat_lon(a.geom)
    return {
        "id": a.id,
        "childId": a.child_id,
        "level": getattr(a.level, "value", a.level),
        "score": a.score,
        "reasons": (a.reasons or {}).get("reasons", []),
        "lat": lat_lon[0] if lat_lon else None,
        "lon": lat_lon[1] if lat_lon else None,
        "status": getattr(a.status, "value", a.status),
        "createdAt": a.created_at.isoformat(),
        "resolvedAt": a.resolved_at.isoformat() if a.resolved_at else None,
    }


def _visible(access, alert) -> bool:
    level = getattr(alert.level, "value", alert.level)
    return access.has("alertes_urgence" if level == "urgence" else "alertes_prealerte")


# Déclarée avant /{child_id}/alerts, et le routeur « alerts » est inclus avant
# « children » : sinon GET /children/alerts était capturé par GET /children/{child_id}.
@router.get("/alerts")
async def list_all_alerts(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    children = await crud_child.list_by_user(db, current_user.id, current_user.role)
    visible = []
    for child in children:
        try:
            access = await get_child_access(db, current_user, child.id)
        except HTTPException:
            continue
        visible.extend(a for a in await crud_alert.list_by_child(db, child.id) if _visible(access, a))
    visible.sort(key=lambda a: a.created_at, reverse=True)
    return [alert_dict(a) for a in visible]


@router.get("/{child_id}/alerts")
async def list_alerts(child_id: str, status: str | None = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_any("alertes_prealerte", "alertes_urgence")
    alerts = await crud_alert.list_by_child(db, child_id, status)
    return [alert_dict(a) for a in alerts if _visible(access, a)]


@router.patch("/alerts/{alert_id}")
async def patch_alert(alert_id: str, req: AlertPatch, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    alert = await crud_alert.get(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte introuvable")
    access = await get_child_access(db, current_user, alert.child_id)
    # Acquitter / confirmer / marquer fausse : réservé au principal (CDC App §4.4).
    access.require_principal()
    current = getattr(alert.status, "value", alert.status)
    if req.status == current:
        return alert_dict(alert)  # idempotent : un double envoi ne change rien
    if req.status not in ALLOWED_TRANSITIONS.get(current, set()):
        raise HTTPException(status_code=409, detail="Transition de statut non autorisée")
    update = {"status": req.status}
    if req.status in ("fausse", "resolue"):
        update["resolved_at"] = datetime.now(timezone.utc)
    updated = await crud_alert.update(db, alert, update)
    # TODO(IA) : le statut « fausse » doit alimenter le retour d'apprentissage (CDC App §4.4).
    return alert_dict(updated)
