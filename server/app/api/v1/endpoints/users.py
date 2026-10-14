from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import revoke_all_refresh_tokens
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.crud.push_token import crud_push_token
from app.crud.user import crud_user
from app.models.child import Child
from app.models.push_token import PushToken
from app.models.sharing import SecondaryAccess
from app.models.user import User
from app.schemas.auth import PushTokenRequest, UserPatchRequest

router = APIRouter()


def _user_dict(u):
    return {
        "id": u.id,
        "nom": u.nom,
        "email": u.email,
        "telephone": u.telephone,
        "role": u.role,
        "langue": u.langue,
        "twofaEnabled": u.twofa_enabled,
        "createdAt": u.created_at.isoformat(),
    }


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return _user_dict(current_user)


@router.patch("/me")
async def patch_me(req: UserPatchRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    updated = await crud_user.update(db, current_user, req.model_dump(exclude_none=True))
    return _user_dict(updated)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Suppression de compte (CDC App §4.6, §8) : effet immédiat côté accès —
    sessions révoquées, jetons push supprimés, enfants désactivés, partages
    révoqués. La purge physique des positions suit la politique de rétention
    (tâche `purge`, POSITION_RETENTION_DAYS) ; À VALIDER : purge immédiate ou différée.
    """
    now = datetime.now(timezone.utc)
    current_user.deleted_at = now
    await revoke_all_refresh_tokens(db, current_user.id)
    await db.execute(delete(PushToken).where(PushToken.user_id == current_user.id))
    await db.execute(update(Child).where(Child.parent_id == current_user.id, Child.deleted_at.is_(None)).values(deleted_at=now, device_id=None))
    await db.execute(update(SecondaryAccess).where(SecondaryAccess.user_id == current_user.id).values(status="revoque"))
    await db.flush()
    return None


@router.post("/me/push-token", status_code=204)
async def register_push_token(req: PushTokenRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    existing = await crud_push_token.list(db, token=req.token)
    for row in existing:
        if row.user_id != current_user.id:
            # Téléphone passé à un autre compte : l'ancien ne doit plus recevoir d'alertes.
            await db.delete(row)
    if not any(row.user_id == current_user.id for row in existing):
        await crud_push_token.create(db, {"user_id": current_user.id, "token": req.token, "platform": req.platform})
    await db.flush()
    return None
