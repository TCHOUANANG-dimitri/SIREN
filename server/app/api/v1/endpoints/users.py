from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import UserPatchRequest
from app.crud.user import crud_user
from app.crud.push_token import crud_push_token

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
async def patch_me(
    req: UserPatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updated = await crud_user.update(db, current_user, req.model_dump(exclude_none=True))
    return _user_dict(updated)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    current_user.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return None


@router.post("/me/push-token", status_code=204)
async def register_push_token(
    req: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await crud_push_token.create(db, {
        "user_id": current_user.id,
        "token": req.get("token"),
        "platform": req.get("platform", "fcm"),
    })
    return None
