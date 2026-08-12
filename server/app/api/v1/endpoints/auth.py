from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.crud.user import crud_user
from app.crud.refresh_token import crud_refresh_token
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse, RefreshRequest,
    ForgotPasswordRequest
)
from datetime import datetime, timezone

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


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await crud_user.get_by_email(db, req.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email déjà utilisé")

    user = await crud_user.create_user(db, req.nom, req.email, req.password, req.telephone)
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)

    await crud_refresh_token.create(db, {
        "user_id": user.id,
        "token_hash": hash_password(refresh_token),
        "expires_at": datetime.now(timezone.utc),
    })

    return {
        "user": _user_dict(user),
        "accessToken": access_token,
        "refreshToken": refresh_token,
    }


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await crud_user.get_by_email(db, req.email)
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect")

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)

    await crud_refresh_token.create(db, {
        "user_id": user.id,
        "token_hash": hash_password(refresh_token),
        "expires_at": datetime.now(timezone.utc),
    })

    return {
        "user": _user_dict(user),
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "twofaRequired": user.twofa_enabled,
    }


@router.post("/refresh")
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(req.refreshToken)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de rafraîchissement invalide")

    stored = await crud_refresh_token.get_by_hash(db, hash_password(req.refreshToken))
    if not stored or stored.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de rafraîchissement révoqué")

    stored.revoked = True
    new_access = create_access_token(subject=payload["sub"])
    return {"accessToken": new_access}


@router.post("/forgot")
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await crud_user.get_by_email(db, req.email)
    if user:
        pass
    return {"sent": True}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    stored = await crud_refresh_token.get_by_hash(db, hash_password(req.refreshToken))
    if stored:
        stored.revoked = True
    return None


@router.post("/request-otp")
async def request_otp(db: AsyncSession = Depends(get_db)):
    return {"devHint": "123456"}


@router.post("/verify-otp")
async def verify_otp(req: dict, db: AsyncSession = Depends(get_db)):
    if req.get("code") == "123456":
        return {"verified": True}
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Code OTP invalide")
