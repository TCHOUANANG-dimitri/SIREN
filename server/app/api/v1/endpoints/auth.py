from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_token, verify_password
from app.crud.refresh_token import crud_refresh_token
from app.crud.user import crud_user
from app.models.refresh_token import RefreshToken
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    OtpRequest,
    OtpVerifyRequest,
    RefreshRequest,
    RegisterRequest,
)

router = APIRouter()


def _user_dict(user):
    return {
        "id": user.id,
        "nom": user.nom,
        "email": user.email,
        "telephone": user.telephone,
        "role": user.role,
        "langue": user.langue,
        "twofaEnabled": user.twofa_enabled,
        "createdAt": user.created_at.isoformat(),
    }


async def _issue_tokens(db: AsyncSession, user_id: str) -> dict:
    access_token = create_access_token(subject=user_id)
    refresh_token = create_refresh_token(subject=user_id)
    await crud_refresh_token.create(db, {
        "user_id": user_id,
        "token_hash": hash_token(refresh_token),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    })
    return {"accessToken": access_token, "refreshToken": refresh_token}


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await crud_user.get_by_email(db, req.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email déjà utilisé")

    user = await crud_user.create_user(db, req.nom, req.email, req.password, req.telephone)
    return {"user": _user_dict(user), **(await _issue_tokens(db, user.id))}


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await crud_user.get_by_email(db, req.email)
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect")

    # NB : tant qu'aucun fournisseur OTP n'existe, la 2FA ne peut pas être activée
    # (twofa_enabled reste faux) ; le flux « jeton temporaire » reste à spécifier.
    return {"user": _user_dict(user), **(await _issue_tokens(db, user.id)), "twofaRequired": bool(user.twofa_enabled)}


@router.post("/refresh")
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(req.refreshToken)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de rafraîchissement invalide")

    stored = await crud_refresh_token.get_by_hash(db, hash_token(req.refreshToken))
    if not stored or stored.revoked or stored.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de rafraîchissement révoqué")

    user = await crud_user.get(db, payload["sub"])
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Compte indisponible")

    # Rotation : l'ancien refresh token est révoqué, un nouveau est émis.
    stored.revoked = True
    return await _issue_tokens(db, user.id)


@router.post("/forgot")
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    # Réponse identique que l'email existe ou non (pas d'énumération de comptes).
    # BLOQUANT : aucun fournisseur d'email transactionnel branché — aucun lien n'est envoyé.
    return {"sent": True}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    stored = await crud_refresh_token.get_by_hash(db, hash_token(req.refreshToken))
    if stored:
        stored.revoked = True
    return None


@router.post("/request-otp")
async def request_otp(req: OtpRequest | None = None):
    mode = settings.otp_mode
    if mode == "disabled":
        # Contrat : l'app saute l'écran OTP quand `required` est faux.
        return {"required": False, "sent": False}
    if mode == "provider":
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Fournisseur OTP non branché")
    return {"required": True, "sent": True, "devHint": settings.DEV_OTP_CODE}


@router.post("/verify-otp")
async def verify_otp(req: OtpVerifyRequest):
    mode = settings.otp_mode
    if mode == "disabled":
        return {"verified": True, "required": False}
    if mode == "provider":
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Fournisseur OTP non branché")
    if req.code != settings.DEV_OTP_CODE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Code OTP invalide")
    return {"verified": True}


async def revoke_all_refresh_tokens(db: AsyncSession, user_id: str) -> None:
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user_id).values(revoked=True))
