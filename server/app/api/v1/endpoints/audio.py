"""
Écoute audio encadrée — CDC App §4.4. Uniquement pour le parent principal,
motif obligatoire, journalisée. Jamais d'audio brut : seules des étiquettes.

BLOQUANT juridique : désactivée tant que AUDIO_ENABLED n'est pas vrai (cadre
légal à valider) ; le flux dispositif → étiquettes n'existe pas encore.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import get_child_access
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.crud.audio import crud_audio_activation
from app.crud.risk import crud_risk
from app.crud.user import crud_user
from app.models.user import User

router = APIRouter()


class AudioActivate(BaseModel):
    reason: str = Field(..., min_length=10, max_length=500)
    explicitRequest: bool = False


@router.post("/{child_id}/audio/activate", status_code=201)
async def request_audio_activation(child_id: str, req: AudioActivate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    if not settings.AUDIO_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Écoute désactivée (cadre juridique à valider)")
    latest = await crud_risk.get_latest(db, child_id)
    in_emergency = latest is not None and latest.state in ("urgence", "disparition")
    if not in_emergency and not req.explicitRequest:
        raise HTTPException(status_code=403, detail="Écoute réservée à une urgence ou à une demande explicite motivée")
    activation = await crud_audio_activation.create(db, {"child_id": child_id, "requested_by": current_user.id, "reason": req.reason})
    return {
        "id": activation.id,
        "childId": activation.child_id,
        "requestedBy": current_user.nom,
        "reason": activation.reason,
        "startedAt": activation.started_at.isoformat(),
        "labels": activation.labels or [],
    }


@router.get("/{child_id}/audio/logs")
async def list_audio_logs(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    access = await get_child_access(db, current_user, child_id)
    access.require_principal()
    logs = []
    for entry in await crud_audio_activation.list(db, child_id=child_id):
        requester = await crud_user.get(db, entry.requested_by)
        logs.append({
            "id": entry.id,
            "childId": entry.child_id,
            "requestedBy": requester.nom if requester else "—",
            "reason": entry.reason,
            "startedAt": entry.started_at.isoformat(),
            "labels": entry.labels or [],
        })
    return logs
