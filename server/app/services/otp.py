"""
Codes à usage unique (OTP) envoyés par email.

Garanties (tests/test_otp.py) :
- code aléatoire à 6 chiffres (`secrets`), jamais stocké en clair (HMAC-SHA256) ;
- durée de vie limitée (OTP_TTL_MINUTES), usage unique (`consumed_at`) ;
- OTP_MAX_ATTEMPTS essais par code, puis le code est grillé ;
- limitation d'envoi : délai minimal entre deux envois et plafond horaire ;
- un nouveau code invalide les précédents du même usage ;
- le jeton de challenge (renvoyé à l'app) est lui aussi aléatoire et haché.

Mode "dev" : le code est DEV_OTP_CODE (jamais hors développement, voir config).
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import api_error
from app.models.otp_challenge import OtpChallenge
from app.services.email import EmailDeliveryFailed, EmailUnavailable, email_available, render, send_email

Purpose = Literal["signup_verify", "login_2fa", "password_reset"]
Verdict = Literal["ok", "invalid", "expired", "consumed", "too_many"]


def digest(value: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def generate_code() -> str:
    if settings.otp_mode == "dev":
        return settings.DEV_OTP_CODE
    return f"{secrets.randbelow(10**6):06d}"


def new_challenge_token() -> str:
    return secrets.token_urlsafe(32)


def evaluate_attempt(challenge: OtpChallenge, code: str, now: datetime) -> Verdict:
    """Décision pure (sans base) sur une tentative de saisie."""
    if challenge.consumed_at is not None:
        return "consumed"
    if challenge.expires_at <= now:
        return "expired"
    if challenge.attempts >= settings.OTP_MAX_ATTEMPTS:
        return "too_many"
    if not hmac.compare_digest(challenge.code_hash, digest(code.strip())):
        return "invalid"
    return "ok"


def verdict_error(verdict: Verdict):
    if verdict == "expired" or verdict == "consumed":
        return api_error(400, "otp_expired", "Code expiré ou déjà utilisé")
    if verdict == "too_many":
        return api_error(429, "otp_attempts_exceeded", "Trop d'essais, demandez un nouveau code")
    return api_error(400, "otp_invalid", "Code incorrect")


async def _check_rate_limit(db: AsyncSession, user_id: str, purpose: Purpose, now: datetime) -> None:
    since = now - timedelta(hours=1)
    count = (
        await db.execute(
            select(func.count()).select_from(OtpChallenge).where(
                OtpChallenge.user_id == user_id, OtpChallenge.purpose == purpose, OtpChallenge.created_at >= since
            )
        )
    ).scalar_one()
    if count >= settings.OTP_MAX_PER_HOUR:
        raise api_error(429, "otp_rate_limited", "Trop de codes demandés", {"retryAfter": 3600})
    last = (
        await db.execute(
            select(OtpChallenge.created_at)
            .where(OtpChallenge.user_id == user_id, OtpChallenge.purpose == purpose)
            .order_by(OtpChallenge.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if last is not None:
        wait = settings.OTP_RESEND_COOLDOWN_S - int((now - last).total_seconds())
        if wait > 0:
            raise api_error(429, "otp_rate_limited", "Nouveau code trop tôt", {"retryAfter": wait})


TEMPLATE_FOR: dict[str, str] = {"signup_verify": "signup_verify", "login_2fa": "login_2fa", "password_reset": "password_reset"}


async def issue(db: AsyncSession, user, purpose: Purpose) -> dict:
    """
    Crée un code, l'envoie par email et renvoie {challengeToken, expiresIn[, devHint]}.
    Lève 503 email_unavailable / 502 email_failed plutôt que de prétendre avoir envoyé.
    """
    mode = settings.otp_mode
    if mode == "email" and not email_available():
        raise api_error(503, "email_unavailable", "Aucun canal email configuré")
    now = datetime.now(timezone.utc)
    await _check_rate_limit(db, user.id, purpose, now)
    # Un nouveau code rend caducs les précédents du même usage.
    await db.execute(
        update(OtpChallenge)
        .where(OtpChallenge.user_id == user.id, OtpChallenge.purpose == purpose, OtpChallenge.consumed_at.is_(None))
        .values(consumed_at=now)
    )
    code = generate_code()
    token = new_challenge_token()
    db.add(
        OtpChallenge(
            user_id=user.id,
            purpose=purpose,
            token_hash=digest(token),
            code_hash=digest(code),
            expires_at=now + timedelta(minutes=settings.OTP_TTL_MINUTES),
        )
    )
    await db.flush()
    response: dict = {"challengeToken": token, "expiresIn": settings.OTP_TTL_MINUTES * 60, "sent": False}
    if mode == "dev" and not email_available():
        response["devHint"] = code
        return response
    email = render(TEMPLATE_FOR[purpose], user.langue or "fr", {"name": user.nom, "code": code, "minutes": settings.OTP_TTL_MINUTES})
    try:
        await send_email(user.email, email)
    except EmailUnavailable:
        raise api_error(503, "email_unavailable", "Aucun canal email configuré")
    except EmailDeliveryFailed:
        raise api_error(502, "email_failed", "Envoi de l'email impossible")
    response["sent"] = True
    return response


async def find_challenge(db: AsyncSession, token: str, purpose: Purpose) -> Optional[OtpChallenge]:
    result = await db.execute(
        select(OtpChallenge).where(OtpChallenge.token_hash == digest(token), OtpChallenge.purpose == purpose)
    )
    return result.scalars().first()


async def consume(db: AsyncSession, token: str, code: str, purpose: Purpose) -> str:
    """Valide le code ; renvoie l'id utilisateur ou lève une erreur métier. Chaque échec compte."""
    challenge = await find_challenge(db, token, purpose)
    if challenge is None:
        raise api_error(400, "challenge_invalid", "Vérification inconnue ou expirée")
    now = datetime.now(timezone.utc)
    verdict = evaluate_attempt(challenge, code, now)
    if verdict != "ok":
        if verdict == "invalid":
            challenge.attempts += 1
            await db.flush()
        raise verdict_error(verdict)
    challenge.consumed_at = now
    await db.flush()
    return challenge.user_id
