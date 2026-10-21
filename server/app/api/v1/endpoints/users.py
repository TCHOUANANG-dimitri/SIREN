from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import PASSWORD_BOUND_PURPOSES, issue_tokens, revoke_all_refresh_tokens, user_dict
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
from app.schemas.auth import (
    ChangePasswordRequest,
    PhoneChangeRequest,
    PhoneConfirmRequest,
    PushTokenRequest,
    TwoFactorToggleRequest,
    UserPatchRequest,
)
from app.services import otp, rate_limit
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
    await otp.invalidate_pending(db, current_user.id, PASSWORD_BOUND_PURPOSES)
    tokens = await issue_tokens(db, current_user.id)
    await db.flush()
    await notify_password_changed(current_user)
    return tokens


@router.put("/me/2fa")
async def set_two_factor(req: TwoFactorToggleRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Active / désactive la vérification en deux étapes (code par SMS, WhatsApp ou e-mail
    vérifié à chaque connexion). Mot de passe exigé.
    """
    if not verify_password(req.password, current_user.password_hash):
        raise api_error(status.HTTP_400_BAD_REQUEST, "password_incorrect", "Mot de passe incorrect")
    # Sans canal de livraison (SMS, WhatsApp ou e-mail vérifié), activer la 2FA bloquerait l'accès au compte.
    if req.enabled and settings.otp_mode != "dev" and not otp.allowed_channels(current_user, "login_2fa"):
        raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, "channel_unavailable", "Aucun canal de code configuré")
    changed = bool(current_user.twofa_enabled) != req.enabled
    current_user.twofa_enabled = req.enabled
    await db.flush()
    if changed:
        await notify_twofa_changed(current_user, req.enabled)
    return user_dict(current_user)


async def _check_password_or_fail(db: AsyncSession, user: User, password: str, request: Request) -> None:
    """Vérifie le mot de passe actuel CÔTÉ SERVEUR ; les échecs sont comptés et limités."""
    key = f"{user.id}"
    await rate_limit.ensure_below(db, "password_check", key, settings.LOGIN_MAX_FAILURES_PER_ACCOUNT, settings.LOGIN_FAILURE_WINDOW_S)
    if not verify_password(password, user.password_hash):
        await rate_limit.record(db, "password_check", key)
        await db.commit()
        raise api_error(status.HTTP_400_BAD_REQUEST, "password_incorrect", "Mot de passe actuel incorrect")


@router.post("/me/phone")
async def request_phone_change(req: PhoneChangeRequest, request: Request, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Changement (ou ajout, pour un compte ancien sans numéro) du téléphone, étape 1 :
    mot de passe actuel vérifié, puis code envoyé au NOUVEAU numéro. Rien n'est
    modifié avant la confirmation (POST /users/me/phone/confirm).
    """
    from app.api.v1.endpoints.auth import phone_or_error

    await _check_password_or_fail(db, current_user, req.currentPassword, request)
    new_phone = phone_or_error(req.newPhone)
    if new_phone == current_user.telephone:
        raise api_error(status.HTTP_409_CONFLICT, "phone_unchanged", "C'est déjà votre numéro")
    if await crud_user.get_by_phone(db, new_phone):
        raise api_error(status.HTTP_409_CONFLICT, "phone_taken", "Numéro déjà utilisé")
    return await otp.issue(db, current_user, "phone_change", channel=req.channel, ip=rate_limit.client_ip(request), pending_value=new_phone)


@router.post("/me/phone/confirm")
async def confirm_phone_change(req: PhoneConfirmRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Étape 2 : le code prouve la possession du nouveau numéro. Usage unique, ligne
    verrouillée (pas de double application), lié au compte qui l'a demandé.
    L'ancien numéro est prévenu si un canal téléphonique est configuré.
    """
    from sqlalchemy.exc import IntegrityError

    challenge = await otp.consume(db, req.challengeToken, req.code, "phone_change")
    if challenge.user_id != current_user.id or not challenge.pending_value:
        raise api_error(status.HTTP_400_BAD_REQUEST, "challenge_invalid", "Vérification inconnue")
    # Numéro pris entre-temps par un autre compte (course concurrente).
    if await crud_user.get_by_phone(db, challenge.pending_value):
        raise api_error(status.HTTP_409_CONFLICT, "phone_taken", "Numéro déjà utilisé")
    previous = current_user.telephone
    current_user.telephone = challenge.pending_value
    current_user.telephone_verified_at = datetime.now(timezone.utc)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise api_error(status.HTTP_409_CONFLICT, "phone_taken", "Numéro déjà utilisé")
    from app.services.security_notifications import notify_phone_changed

    await notify_phone_changed(current_user, previous)
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
