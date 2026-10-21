from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, APIRouter, Depends, Header, Request, status
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import api_error
from app.core.phone import InvalidPhone, normalize_phone
from app.core.security import (
    create_access_token,
    create_mfa_token,
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
    TwoFactorSendRequest,
    TwoFactorVerifyRequest,
)
from app.services import otp, rate_limit
from app.services.otp_delivery import available_channels

router = APIRouter()


def user_dict(user):
    """Représentation publique d'un compte (jamais le hash, le secret 2FA ni d'empreinte)."""
    return {
        "id": user.id,
        "nom": user.nom,
        "email": user.email,
        "telephone": user.telephone,
        "role": getattr(user.role, "value", user.role),
        "langue": user.langue,
        "twofaEnabled": bool(user.twofa_enabled),
        "emailVerified": getattr(user, "email_verified_at", None) is not None,
        "phoneVerified": getattr(user, "telephone_verified_at", None) is not None,
        # Compte antérieur à l'obligation du téléphone : l'app demande de le compléter.
        "phoneRequired": not user.telephone,
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


# Codes en attente rendus caducs dès que le mot de passe change : un ancien jeton de
# connexion ou de récupération ne survit pas à la reprise en main du compte.
PASSWORD_BOUND_PURPOSES = ("login_2fa", "password_reset", "phone_change")


def canonical_identifier(identifier: str) -> str:
    """Clé de limitation d'un identifiant : e-mail en minuscules ou numéro E.164.
    Sans cela, « 690000000 » et « +237 690 000 000 » seraient deux compteurs pour un même compte."""
    identifier = identifier.strip()
    if "@" in identifier:
        return identifier.lower()
    try:
        return normalize_phone(identifier)
    except InvalidPhone:
        return identifier.lower()


def phone_or_error(raw: str) -> str:
    try:
        return normalize_phone(raw)
    except InvalidPhone:
        raise api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, "phone_invalid", "Numéro de téléphone invalide")


@router.get("/otp/channels")
async def otp_channels():
    """Canaux de livraison configurés côté serveur (l'e-mail n'est proposé qu'aux adresses vérifiées)."""
    return {"channels": available_channels(), "codeLength": otp.code_length()}


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limit.hit(db, "register_ip", rate_limit.client_ip(request), settings.REGISTER_MAX_PER_IP_PER_HOUR, 3600)
    # Compté AVANT les 409 (numéro / e-mail pris) : sinon le rollback de la requête en
    # échec effacerait l'essai et l'énumération des comptes serait illimitée.
    await db.commit()
    telephone = phone_or_error(req.telephone)
    if await crud_user.get_by_phone(db, telephone):
        raise api_error(status.HTTP_409_CONFLICT, "phone_taken", "Numéro déjà utilisé")
    email = req.email.lower() if req.email else None
    if email and await crud_user.get_by_email(db, email):
        raise api_error(status.HTTP_409_CONFLICT, "email_taken", "Email déjà utilisé")

    try:
        user = await crud_user.create_user(db, req.nom.strip(), email, req.password, telephone)
    except IntegrityError:
        # Inscription concurrente, ou e-mail encore porté par un compte supprimé (contrainte unique).
        await db.rollback()
        raise api_error(status.HTTP_409_CONFLICT, "email_taken" if email else "phone_taken", "Compte déjà existant")
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


_DUMMY_HASH: str | None = None


def _dummy_hash() -> str:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(otp.new_challenge_token())
    return _DUMMY_HASH


async def _register_login_failure(db: AsyncSession, account_key: str, ip: str) -> None:
    await rate_limit.record(db, "login_account", account_key)
    await rate_limit.record(db, "login_ip", ip)
    await db.commit()  # l'échec reste compté même si la requête répond 401


@router.post("/login")
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    identifier = req.login_identifier()
    ip = rate_limit.client_ip(request)
    # Le compteur porte sur l'identifiant normalisé : même réponse que le compte existe ou non.
    account_key = canonical_identifier(identifier)
    await rate_limit.ensure_below(db, "login_account", account_key, settings.LOGIN_MAX_FAILURES_PER_ACCOUNT, settings.LOGIN_FAILURE_WINDOW_S)
    await rate_limit.ensure_below(db, "login_ip", ip, settings.LOGIN_MAX_FAILURES_PER_IP, settings.LOGIN_FAILURE_WINDOW_S)

    user = await crud_user.get_by_identifier(db, identifier) if identifier else None
    if not user or user.deleted_at is not None:
        # Même coût bcrypt qu'un compte existant : pas d'énumération par le temps de réponse.
        verify_password(req.password, _dummy_hash())
        await _register_login_failure(db, account_key, ip)
        raise api_error(status.HTTP_401_UNAUTHORIZED, "invalid_credentials", "Identifiants incorrects")
    if not verify_password(req.password, user.password_hash):
        await _register_login_failure(db, account_key, ip)
        raise api_error(status.HTTP_401_UNAUTHORIZED, "invalid_credentials", "Identifiants incorrects")
    await rate_limit.clear(db, "login_account", account_key)

    if user.twofa_enabled:
        # Second facteur : AUCUN jeton de session avant la validation du code.
        # L'utilisateur choisit ensuite le canal (POST /auth/2fa/send).
        return {
            "twofaRequired": True,
            "mfaToken": create_mfa_token(user.id),
            "channels": otp.allowed_channels(user, "login_2fa"),
        }
    return {"user": user_dict(user), **(await issue_tokens(db, user.id)), "twofaRequired": False}


def _mfa_user_id(token: str) -> str:
    payload = decode_token(token)
    if not payload or payload.get("type") != "mfa":
        raise api_error(status.HTTP_401_UNAUTHORIZED, "challenge_invalid", "Vérification expirée")
    return payload["sub"]


@router.post("/2fa/send")
async def send_second_factor(req: TwoFactorSendRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Envoie (ou renvoie) le code de connexion par le canal choisi ; invalide le précédent."""
    user = await _active_user(db, _mfa_user_id(req.mfaToken))
    return await otp.issue(db, user, "login_2fa", channel=req.channel, ip=rate_limit.client_ip(request))


@router.post("/2fa/verify")
async def verify_second_factor(req: TwoFactorVerifyRequest, db: AsyncSession = Depends(get_db)):
    challenge = await otp.consume(db, req.challengeToken, req.code, "login_2fa")
    user = await _active_user(db, challenge.user_id)
    return {"user": user_dict(user), **(await issue_tokens(db, user.id))}


@router.post("/2fa/resend")
async def resend_second_factor(req: ChallengeRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Compatibilité v1 : renvoie un code par le même canal que le précédent.
    Seul un challenge encore valable est renouvelable : un jeton consommé, expiré ou
    invalidé (changement de mot de passe) ne redonne jamais accès au second facteur."""
    challenge = await otp.find_live_challenge(db, req.challengeToken, "login_2fa")
    if challenge is None:
        raise api_error(status.HTTP_400_BAD_REQUEST, "challenge_invalid", "Vérification inconnue")
    user = await _active_user(db, challenge.user_id)
    return await otp.issue(db, user, "login_2fa", channel=challenge.channel or "sms", ip=rate_limit.client_ip(request))


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
async def forgot_password(req: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Récupération du compte par code (SMS, WhatsApp ou e-mail vérifié). La réponse a la
    même forme que le compte existe ou non (pas d'énumération) : un jeton de challenge
    est toujours renvoyé, il ne mène simplement à rien si aucun compte ne correspond.
    Un canal non configuré est signalé (503), jamais simulé.
    """
    ip = rate_limit.client_ip(request)
    await rate_limit.hit(db, "forgot_ip", ip, settings.OTP_MAX_PER_IP_PER_HOUR, 3600)
    if settings.otp_mode != "dev" and req.channel not in available_channels():
        raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, "channel_unavailable", "Canal non configuré", {"channel": req.channel})
    identifier = req.login_identifier()
    user = await crud_user.get_by_identifier(db, identifier) if identifier else None
    uniform = {"challengeToken": otp.new_challenge_token(), "expiresIn": settings.OTP_TTL_MINUTES * 60}
    if not user or user.deleted_at is not None or req.channel not in otp.allowed_channels(user, "password_reset"):
        return uniform
    try:
        challenge = await otp.issue(db, user, "password_reset", channel=req.channel, ip=ip)
    except HTTPException as error:
        # Plafond atteint ou fournisseur en échec pour CE compte : même réponse qu'un compte
        # inconnu (un 429/502/503 propre aux comptes existants permettrait l'énumération).
        if error.status_code in (status.HTTP_429_TOO_MANY_REQUESTS, status.HTTP_502_BAD_GATEWAY, status.HTTP_503_SERVICE_UNAVAILABLE):
            return uniform
        raise
    return {"challengeToken": challenge["challengeToken"], "expiresIn": challenge["expiresIn"], **({"devHint": challenge["devHint"]} if "devHint" in challenge else {})}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    challenge = await otp.consume(db, req.challengeToken, req.code, "password_reset")
    user = await _active_user(db, challenge.user_id)
    user.password_hash = hash_password(req.newPassword)
    await revoke_all_refresh_tokens(db, user.id)
    await otp.invalidate_pending(db, user.id, PASSWORD_BOUND_PURPOSES)
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
    request: Request,
    req: OtpRequest | None = None,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Code de vérification du téléphone (ou de l'e-mail) après inscription."""
    req = req or OtpRequest()
    mode = settings.otp_mode
    if mode == "disabled":
        # Contrat : l'app saute l'écran OTP quand `required` est faux.
        return {"required": False, "sent": False}
    user = await _user_from_access_token(db, req.accessToken or _bearer(authorization))
    if user is None:
        raise api_error(status.HTTP_401_UNAUTHORIZED, "challenge_invalid", "Session requise")
    purpose = "signup_verify" if req.target == "email" else "phone_verify"
    channel = "email" if req.target == "email" else req.channel
    return {"required": True, **(await otp.issue(db, user, purpose, channel=channel, ip=rate_limit.client_ip(request)))}


@router.post("/verify-otp")
async def verify_otp(
    req: OtpVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    if settings.otp_mode == "disabled":
        return {"verified": True, "required": False}
    if not req.challengeToken:
        raise api_error(status.HTTP_400_BAD_REQUEST, "challenge_invalid", "Vérification inconnue")
    # Le jeton désigne l'usage : vérification du téléphone, sinon de l'e-mail.
    challenge = await otp.find_challenge(db, req.challengeToken, "phone_verify")
    purpose = "phone_verify" if challenge is not None else "signup_verify"
    consumed = await otp.consume(db, req.challengeToken, req.code, purpose)
    user = await _active_user(db, consumed.user_id)
    now = datetime.now(timezone.utc)
    if purpose == "phone_verify":
        user.telephone_verified_at = now
    else:
        user.email_verified_at = now
    await db.flush()
    return {"verified": True, "user": user_dict(user)}
