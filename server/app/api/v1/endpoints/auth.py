from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import api_error
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.crud.refresh_token import crud_refresh_token
from app.crud.user import crud_user
from app.models.refresh_token import RefreshToken
from app.schemas.auth import (
    ChallengeRequest,
    ForgotPasswordRequest,
    LoginRequest,
    OtpRequest,
    OtpVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TwoFactorVerifyRequest,
)
from app.services import otp
from app.services.email import email_available

router = APIRouter()


def user_dict(user):
    return {
        "id": user.id,
        "nom": user.nom,
        "email": user.email,
        "telephone": user.telephone,
        "role": user.role,
        "langue": user.langue,
        "twofaEnabled": bool(user.twofa_enabled),
        "emailVerified": getattr(user, "email_verified_at", None) is not None,
        "createdAt": user.created_at.isoformat(),
    }


async def issue_tokens(db: AsyncSession, user_id: str) -> dict:
    access_token = create_access_token(subject=user_id)
    refresh_token = create_refresh_token(subject=user_id)
    await crud_refresh_token.create(db, {
        "user_id": user_id,
        "token_hash": hash_token(refresh_token),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    })
    return {"accessToken": access_token, "refreshToken": refresh_token}


async def revoke_all_refresh_tokens(db: AsyncSession, user_id: str) -> None:
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user_id).values(revoked=True))


async def _active_user(db: AsyncSession, user_id: str):
    user = await crud_user.get(db, user_id)
    if not user or user.deleted_at is not None:
        raise api_error(status.HTTP_401_UNAUTHORIZED, "challenge_invalid", "Compte indisponible")
    return user


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    email = req.email.lower()
    if await crud_user.get_by_email(db, email):
        raise api_error(status.HTTP_409_CONFLICT, "email_taken", "Email déjà utilisé")

    user = await crud_user.create_user(db, req.nom, email, req.password, req.telephone)
    updates = {"langue": req.langue} if req.langue else {}
    if req.acceptedTermsVersion and req.acceptedPrivacyVersion:
        # Preuve du consentement (CDC App §8) : versions exactes des documents acceptés.
        updates.update({
            "terms_version": req.acceptedTermsVersion,
            "privacy_version": req.acceptedPrivacyVersion,
            "legal_accepted_at": datetime.now(timezone.utc),
        })
    if updates:
        user = await crud_user.update(db, user, updates)
    return {"user": user_dict(user), **(await issue_tokens(db, user.id))}


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await crud_user.get_by_email(db, req.email.lower())
    if not user or user.deleted_at is not None or not verify_password(req.password, user.password_hash):
        raise api_error(status.HTTP_401_UNAUTHORIZED, "invalid_credentials", "Email ou mot de passe incorrect")

    if user.twofa_enabled:
        # Second facteur : AUCUN jeton de session avant la validation du code.
        challenge = await otp.issue(db, user, "login_2fa")
        return {"twofaRequired": True, **challenge}

    return {"user": user_dict(user), **(await issue_tokens(db, user.id)), "twofaRequired": False}


@router.post("/2fa/verify")
async def verify_second_factor(req: TwoFactorVerifyRequest, db: AsyncSession = Depends(get_db)):
    user_id = await otp.consume(db, req.challengeToken, req.code, "login_2fa")
    user = await _active_user(db, user_id)
    return {"user": user_dict(user), **(await issue_tokens(db, user.id))}


@router.post("/2fa/resend")
async def resend_second_factor(req: ChallengeRequest, db: AsyncSession = Depends(get_db)):
    challenge = await otp.find_challenge(db, req.challengeToken, "login_2fa")
    if challenge is None:
        raise api_error(status.HTTP_400_BAD_REQUEST, "challenge_invalid", "Vérification inconnue")
    user = await _active_user(db, challenge.user_id)
    return await otp.issue(db, user, "login_2fa")


@router.post("/refresh")
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(req.refreshToken)
    if not payload or payload.get("type") != "refresh":
        raise api_error(status.HTTP_401_UNAUTHORIZED, "session_invalid", "Token de rafraîchissement invalide")

    stored = await crud_refresh_token.get_by_hash(db, hash_token(req.refreshToken))
    if not stored or stored.revoked or stored.expires_at <= datetime.now(timezone.utc):
        raise api_error(status.HTTP_401_UNAUTHORIZED, "session_invalid", "Token de rafraîchissement révoqué")

    user = await crud_user.get(db, payload["sub"])
    if not user or user.deleted_at is not None:
        raise api_error(status.HTTP_401_UNAUTHORIZED, "session_invalid", "Compte indisponible")

    # Rotation : l'ancien refresh token est révoqué, un nouveau est émis.
    stored.revoked = True
    return await issue_tokens(db, user.id)


@router.post("/forgot")
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Envoie un code de réinitialisation. La réponse a la même forme que le compte
    existe ou non (pas d'énumération) : un jeton de challenge est toujours renvoyé,
    il ne mène simplement à rien si aucun compte ne correspond.
    Sans canal email configuré, la route le dit (503) au lieu de simuler un envoi.
    """
    if settings.otp_mode != "dev" and not email_available():
        raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, "email_unavailable", "Aucun canal email configuré")
    user = await crud_user.get_by_email(db, req.email.lower())
    if not user or user.deleted_at is not None:
        return {"challengeToken": otp.new_challenge_token(), "expiresIn": settings.OTP_TTL_MINUTES * 60}
    challenge = await otp.issue(db, user, "password_reset")
    challenge.pop("sent", None)
    return challenge


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user_id = await otp.consume(db, req.challengeToken, req.code, "password_reset")
    user = await _active_user(db, user_id)
    user.password_hash = hash_password(req.newPassword)
    await revoke_all_refresh_tokens(db, user.id)
    await db.flush()
    from app.services.security_notifications import notify_password_changed

    await notify_password_changed(user)
    return None


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    stored = await crud_refresh_token.get_by_hash(db, hash_token(req.refreshToken))
    if stored:
        stored.revoked = True
    return None


async def _user_from_access_token(db: AsyncSession, token: str | None):
    payload = decode_token(token) if token else None
    if not payload or payload.get("type") != "access":
        return None
    user = await crud_user.get(db, payload["sub"])
    return user if user and user.deleted_at is None else None


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


@router.post("/request-otp")
async def request_otp(
    req: OtpRequest | None = None,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Code de confirmation de l'adresse email après inscription (session en attente côté app)."""
    mode = settings.otp_mode
    if mode == "disabled":
        # Contrat : l'app saute l'écran OTP quand `required` est faux.
        return {"required": False, "sent": False}
    token = (req.accessToken if req else None) or _bearer(authorization)
    user = await _user_from_access_token(db, token)
    if user is None:
        if mode == "dev":
            # Compatibilité v1 (sans jeton) : code fixe de développement.
            return {"required": True, "sent": True, "devHint": settings.DEV_OTP_CODE}
        raise api_error(status.HTTP_401_UNAUTHORIZED, "challenge_invalid", "Session requise")
    return {"required": True, **(await otp.issue(db, user, "signup_verify"))}


@router.post("/verify-otp")
async def verify_otp(
    req: OtpVerifyRequest,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    mode = settings.otp_mode
    if mode == "disabled":
        return {"verified": True, "required": False}
    if req.challengeToken:
        user_id = await otp.consume(db, req.challengeToken, req.code, "signup_verify")
        user = await _active_user(db, user_id)
        user.email_verified_at = datetime.now(timezone.utc)
        await db.flush()
        return {"verified": True}
    if mode == "dev":
        # Compatibilité v1 : code fixe sans challenge (développement uniquement).
        if req.code != settings.DEV_OTP_CODE:
            raise api_error(status.HTTP_400_BAD_REQUEST, "otp_invalid", "Code OTP invalide")
        return {"verified": True}
    raise api_error(status.HTTP_400_BAD_REQUEST, "challenge_invalid", "Vérification inconnue")
