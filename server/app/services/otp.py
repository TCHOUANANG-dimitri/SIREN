"""
Codes à usage unique (OTP) : vérification du téléphone, connexion en deux
étapes, récupération du compte et changement de numéro.

Garanties (tests/test_otp_and_emails.py, tests/test_account_security.py, tests/test_database*.py) :
- code ALPHANUMÉRIQUE de OTP_LENGTH (≤ 6) caractères, tiré par `secrets` dans un
  alphabet sans caractères ambigus (pas de 0/O, 1/I/L) ; saisie insensible à la
  casse et aux espaces ;
- jamais stocké en clair (HMAC-SHA256) ; jeton de challenge aléatoire, lui aussi haché ;
- durée de vie courte (OTP_TTL_MINUTES), usage unique (`consumed_at`, verrou de ligne
  à la consommation : deux validations simultanées ne réussissent pas toutes les deux) ;
- OTP_MAX_ATTEMPTS essais par code, puis le code est grillé ;
- un nouveau code pour le même usage invalide le précédent (renvoi) ;
- limitation d'envoi par compte+usage (délai minimal et plafond horaire), par
  destination et par IP ;
- usages séparés : un code de connexion ne vaut pas pour un changement de numéro ;
- un numéro de téléphone n'est prouvé que par un code reçu SUR ce numéro (sms,
  whatsapp) : jamais par un code envoyé à l'e-mail ;
- un changement de mot de passe rend caducs les codes en attente (connexion,
  récupération, changement de numéro) ;
- le code n'apparaît dans aucun journal ; en mode « dev » seulement, il est rendu
  dans la réponse (`devHint`) pour les tests manuels.
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
from app.services.otp_delivery import (
    DeliveryFailed,
    DeliveryUnavailable,
    OtpMessage,
    channel_available,
    deliver,
)

Purpose = Literal["phone_verify", "signup_verify", "login_2fa", "password_reset", "phone_change"]
Channel = Literal["sms", "whatsapp", "email"]
Verdict = Literal["ok", "invalid", "expired", "consumed", "too_many"]

# 31 symboles : pas de 0/O, 1/I/L, faciles à lire et à taper sur mobile.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
PHONE_CHANNELS = ("sms", "whatsapp")
# Usages qui prouvent la possession d'un numéro : seul un canal téléphonique convient.
PHONE_PROOF_PURPOSES = ("phone_verify", "phone_change")


def code_length() -> int:
    return max(4, min(6, settings.OTP_LENGTH))


def digest(value: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def normalize_code(value: str) -> str:
    """Saisie tolérante : majuscules, sans espaces ni tirets."""
    return "".join(ch for ch in value.upper() if ch.isalnum())


def generate_code() -> str:
    if settings.otp_mode == "dev":
        return normalize_code(settings.DEV_OTP_CODE)[: code_length()]
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(code_length()))


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
    if not hmac.compare_digest(challenge.code_hash, digest(normalize_code(code))):
        return "invalid"
    return "ok"


def verdict_error(verdict: Verdict):
    if verdict == "expired" or verdict == "consumed":
        return api_error(400, "otp_expired", "Code expiré ou déjà utilisé")
    if verdict == "too_many":
        return api_error(429, "otp_attempts_exceeded", "Trop d'essais, demandez un nouveau code")
    return api_error(400, "otp_invalid", "Code incorrect")


def allowed_channels(user, purpose: Purpose) -> list[str]:
    """
    Canaux proposables pour cet usage et ce compte :
    - téléphone (sms, whatsapp) s'il est configuré ;
    - e-mail seulement si une adresse existe ET est vérifiée (sauf pour la
      vérification de l'e-mail lui-même), jamais pour prouver un numéro
      (vérification ou changement).
    """
    channels = [c for c in PHONE_CHANNELS if channel_available(c)] if getattr(user, "telephone", None) or purpose == "phone_change" else []
    if purpose == "signup_verify":
        return ["email"] if getattr(user, "email", None) and channel_available("email") else []
    if purpose not in PHONE_PROOF_PURPOSES and getattr(user, "email", None) and getattr(user, "email_verified_at", None) and channel_available("email"):
        channels.append("email")
    return channels


def destination_for(user, purpose: Purpose, channel: str, pending_value: Optional[str]) -> Optional[str]:
    if channel == "email":
        return user.email
    if purpose == "phone_change":
        return pending_value
    return user.telephone


async def _ensure_send_allowed(db: AsyncSession, user_id: str, purpose: str, dest_hash: str, ip_hash: str, now: datetime) -> None:
    since = now - timedelta(hours=1)

    async def count(*conditions) -> int:
        return (await db.execute(select(func.count()).select_from(OtpChallenge).where(OtpChallenge.created_at >= since, *conditions))).scalar_one()

    if await count(OtpChallenge.user_id == user_id, OtpChallenge.purpose == purpose) >= settings.OTP_MAX_PER_HOUR:
        raise api_error(429, "otp_rate_limited", "Trop de codes demandés", {"retryAfter": 3600})
    if await count(OtpChallenge.destination_hash == dest_hash) >= settings.OTP_MAX_PER_DESTINATION_PER_HOUR:
        raise api_error(429, "otp_rate_limited", "Trop de codes pour cette destination", {"retryAfter": 3600})
    if await count(OtpChallenge.ip_hash == ip_hash) >= settings.OTP_MAX_PER_IP_PER_HOUR:
        raise api_error(429, "otp_rate_limited", "Trop de codes depuis cette adresse", {"retryAfter": 3600})
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


async def issue(
    db: AsyncSession,
    user,
    purpose: Purpose,
    *,
    channel: str,
    ip: str = "unknown",
    pending_value: Optional[str] = None,
) -> dict:
    """
    Crée un code, l'envoie par `channel` et renvoie {challengeToken, expiresIn, channel, sent[, devHint]}.
    Canal non proposable : 400 channel_not_allowed ; non configuré : 503 channel_unavailable ;
    refus du fournisseur : 502 delivery_failed. Rien n'est prétendu envoyé sans confirmation.
    """
    if channel not in ("sms", "whatsapp", "email"):
        raise api_error(422, "channel_not_allowed", "Canal inconnu")
    # Même en mode dev : un code reçu par e-mail ne prouve pas la possession d'un numéro.
    if purpose in PHONE_PROOF_PURPOSES and channel not in PHONE_CHANNELS:
        raise api_error(400, "channel_not_allowed", "Canal non autorisé pour cette opération", {"channel": channel})
    dev = settings.otp_mode == "dev"
    if not dev and channel not in allowed_channels(user, purpose):
        if not channel_available(channel):
            raise api_error(503, "channel_unavailable", "Canal non configuré", {"channel": channel})
        raise api_error(400, "channel_not_allowed", "Canal non autorisé pour cette opération", {"channel": channel})
    destination = destination_for(user, purpose, channel, pending_value)
    if not destination:
        raise api_error(400, "channel_not_allowed", "Aucune destination pour ce canal", {"channel": channel})

    now = datetime.now(timezone.utc)
    dest_hash, ip_hash = digest(f"dest:{destination}"), digest(f"ip:{ip}")
    await _ensure_send_allowed(db, user.id, purpose, dest_hash, ip_hash, now)
    # Un nouveau code rend caducs les précédents du même usage (renvoi).
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
            channel=channel,
            destination_hash=dest_hash,
            ip_hash=ip_hash,
            pending_value=pending_value,
            token_hash=digest(token),
            code_hash=digest(code),
            expires_at=now + timedelta(minutes=settings.OTP_TTL_MINUTES),
        )
    )
    await db.flush()
    response: dict = {"challengeToken": token, "expiresIn": settings.OTP_TTL_MINUTES * 60, "channel": channel, "sent": False}
    if dev and not channel_available(channel):
        response["devHint"] = code
        return response
    message = OtpMessage(code=code, minutes=settings.OTP_TTL_MINUTES, language=user.langue or "fr", purpose=purpose, name=user.nom)
    try:
        await deliver(channel, destination, message)
    except DeliveryUnavailable:
        raise api_error(503, "channel_unavailable", "Canal non configuré", {"channel": channel})
    except DeliveryFailed:
        raise api_error(502, "delivery_failed", "Envoi du code impossible", {"channel": channel})
    response["sent"] = True
    return response


async def invalidate_pending(db: AsyncSession, user_id: str, purposes: tuple[str, ...]) -> None:
    """Rend caducs les codes non utilisés de ces usages (ex. après un changement de mot de passe)."""
    await db.execute(
        update(OtpChallenge)
        .where(OtpChallenge.user_id == user_id, OtpChallenge.purpose.in_(purposes), OtpChallenge.consumed_at.is_(None))
        .values(consumed_at=datetime.now(timezone.utc))
    )


async def find_live_challenge(db: AsyncSession, token: str, purpose: Purpose) -> Optional[OtpChallenge]:
    """Challenge encore utilisable (ni consommé, ni expiré, ni grillé) : base d'un renvoi."""
    challenge = await find_challenge(db, token, purpose)
    if challenge is None or evaluate_attempt(challenge, "", datetime.now(timezone.utc)) in ("consumed", "expired", "too_many"):
        return None
    return challenge


async def find_challenge(db: AsyncSession, token: str, purpose: Purpose, for_update: bool = False) -> Optional[OtpChallenge]:
    query = select(OtpChallenge).where(OtpChallenge.token_hash == digest(token), OtpChallenge.purpose == purpose)
    if for_update:
        query = query.with_for_update()
    return (await db.execute(query)).scalars().first()


async def consume(db: AsyncSession, token: str, code: str, purpose: Purpose) -> OtpChallenge:
    """
    Valide le code (ligne verrouillée : pas de double consommation concurrente).
    Renvoie le challenge consommé ; chaque échec compte un essai (validé même si la requête échoue).
    """
    challenge = await find_challenge(db, token, purpose, for_update=True)
    if challenge is None:
        raise api_error(400, "challenge_invalid", "Vérification inconnue ou expirée")
    now = datetime.now(timezone.utc)
    verdict = evaluate_attempt(challenge, code, now)
    if verdict != "ok":
        if verdict == "invalid":
            challenge.attempts += 1
            await db.commit()  # l'essai raté reste compté malgré l'erreur renvoyée
        raise verdict_error(verdict)
    challenge.consumed_at = now
    await db.flush()
    return challenge
