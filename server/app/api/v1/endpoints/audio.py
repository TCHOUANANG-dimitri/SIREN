from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.crud.audio import crud_audio_activation

router = APIRouter()


@router.post("/{child_id}/audio/activate", status_code=201)
async def request_audio_activation(child_id: str, req: dict, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    activation = await crud_audio_activation.create(db, {
        "child_id": child_id,
        "requested_by": current_user.id,
        "reason": req.get("reason"),
    })
    return {
        "id": activation.id,
        "childId": activation.child_id,
        "requestedBy": current_user.nom,
        "reason": activation.reason,
        "startedAt": activation.started_at.isoformat(),
        "labels": activation.labels,
    }


@router.get("/{child_id}/audio/logs")
async def list_audio_logs(child_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    logs = await crud_audio_activation.list(db, child_id=child_id)
    return [{
        "id": l.id,
        "childId": l.child_id,
        "requestedBy": l.requested_by,
        "reason": l.reason,
        "startedAt": l.started_at.isoformat(),
        "labels": l.labels,
    } for l in logs]