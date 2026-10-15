from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import issue_tokens, revoke_all_refresh_tokens, user_dict
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import api_error
from app.core.security import hash_password, verify_password
from app.core.dependencies import get_current_user
from app.crud.push_token import crud_push_token
from app.crud.user import crud_user
from app.models.child import Child
from app.models.push_token import PushToken
from app.models.sharing import SecondaryAccess
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, PushTokenRequest, TwoFactorToggleRequest, UserPatchRequest
from app.services.email import email_available
from app.services.security_notifications import notify_password_changed, notify_twofa_changed

router = APIRouter()


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return user_dict(current_user)


@router.patch("/me")
async def patch_me(req: UserPatchRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    updated = await crud_user.update(db, current_user, req.model_dump(exclude_none=True))
    return user_dict(updated)


@router.post("/me/password")
async def change_password(req: ChangePasswordRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Change le mot de passe (ancien exigé), déconnecte les autres sessions, renvoie une nouvelle session."""
    if not verify_password(req.currentPassword, current_user.password_hash):
        raise api_error(status.HTTP_400_BAD_REQUEST, "password_incorrect", "Mot de passe actuel incorrect")
    current_user.password_hash = hash_password(req.newPassword)
    await revoke_all_refresh_tokens(db, current_user.id)
    tokens = await issue_tokens(db, current_user.id)
    await db.flush()
    await notify_password_changed(current_user)
    return tokens


@router.put("/me/2fa")
async def set_two_factor(req: TwoFactorToggleRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Active / désactive la vérification en deux étapes (code par email à chaque connexion).
    Mot de passe exigé. L'activation est refusée sans canal email : elle bloquerait l'accès au compte.
    """
    if not verify_password(req.password, current_user.password_hash):
        raise api_error(status.HTTP_400_BAD_REQUEST, "password_incorrect", "Mot de passe incorrect")
    if req.enabled and settings.otp_mode != "dev" and not email_available():
        raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, "email_unavailable", "Aucun canal email configuré")
    changed = bool(current_user.twofa_enabled) != req.enabled
    current_user.twofa_enabled = req.enabled
    await db.flush()
    if changed:
        await notify_twofa_changed(current_user, req.enabled)
    return user_dict(current_user)


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
