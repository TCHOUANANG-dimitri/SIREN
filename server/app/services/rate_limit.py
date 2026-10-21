"""
Limitation de débit par fenêtre glissante, stockée en base (table rate_limit_events).

Un seul mécanisme pour la connexion, l'envoi de codes et l'appairage : il
fonctionne sans Redis (hébergement mutualisé) et survit aux redémarrages.
Les clés (identifiant, numéro, IP…) ne sont jamais stockées en clair : seule
leur empreinte HMAC-SHA256 l'est.
"""
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import api_error
from app.models.device_link import RateLimitEvent


def key_hash(value: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"rl:{value}".encode(), hashlib.sha256).hexdigest()


def client_ip(request: Request | None) -> str:
    """
    IP du client derrière UN mandataire de confiance (Caddy, Apache/Passenger) :
    la DERNIÈRE adresse de X-Forwarded-For, celle ajoutée par ce mandataire. Les
    précédentes sont fournies par le client et falsifiables (jamais utilisées).
    """
    if request is None:
        return "unknown"
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


async def count_recent(db: AsyncSession, scope: str, key: str, window_s: int) -> int:
    since = datetime.now(timezone.utc) - timedelta(seconds=window_s)
    return (
        await db.execute(
            select(func.count()).select_from(RateLimitEvent).where(
                RateLimitEvent.scope == scope,
                RateLimitEvent.key_hash == key_hash(key),
                RateLimitEvent.created_at >= since,
            )
        )
    ).scalar_one()


async def record(db: AsyncSession, scope: str, key: str) -> None:
    db.add(RateLimitEvent(scope=scope, key_hash=key_hash(key)))
    await db.flush()


async def ensure_below(db: AsyncSession, scope: str, key: str, limit: int, window_s: int) -> None:
    """Refuse (429 rate_limited) si `limit` événements ont déjà eu lieu dans la fenêtre."""
    if await count_recent(db, scope, key, window_s) >= limit:
        raise api_error(429, "rate_limited", "Trop de tentatives", {"retryAfter": window_s})


async def hit(db: AsyncSession, scope: str, key: str, limit: int, window_s: int) -> None:
    """Vérifie puis compte un événement (envois, inscriptions)."""
    await ensure_below(db, scope, key, limit, window_s)
    await record(db, scope, key)


async def clear(db: AsyncSession, scope: str, key: str) -> None:
    """Remet le compteur à zéro (ex. connexion réussie)."""
    await db.execute(delete(RateLimitEvent).where(RateLimitEvent.scope == scope, RateLimitEvent.key_hash == key_hash(key)))


async def purge_older_than(db: AsyncSession, hours: int = 48) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(delete(RateLimitEvent).where(RateLimitEvent.created_at < cutoff))
    return result.rowcount or 0
