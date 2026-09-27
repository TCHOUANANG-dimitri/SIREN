"""
Conventions de temps partagées avec l'application (CDC App §4.2) :

  - stockage et échanges en UTC (ISO 8601) ;
  - horaires déclarés par le parent (école, sommeil) en heure LOCALE ;
  - jours codés 0 = dimanche … 6 = samedi (convention JavaScript de l'app),
    alors que `datetime.weekday()` code 0 = lundi.
"""

from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings


def local_tz() -> ZoneInfo:
    return ZoneInfo(settings.DEFAULT_TIMEZONE)


def app_weekday(dt: datetime) -> int:
    """Jour au format de l'app (0 = dimanche) pour un datetime déjà local."""
    return (dt.weekday() + 1) % 7


def _as_time(value) -> time:
    if isinstance(value, time):
        return value
    hours, minutes = str(value).split(":")[:2]
    return time(int(hours), int(minutes))


def in_schedule(jours, heure_debut, heure_fin, now_utc: datetime | None = None) -> bool:
    """Vrai si l'instant tombe dans le créneau (gère les créneaux qui passent minuit)."""
    now_utc = now_utc or datetime.now(timezone.utc)
    local = now_utc.astimezone(local_tz())
    start, end, current = _as_time(heure_debut), _as_time(heure_fin), local.time().replace(second=0, microsecond=0)
    day = app_weekday(local)
    if start <= end:
        return day in jours and start <= current <= end
    # Créneau de nuit (ex. 21:00 → 06:30) : la partie après minuit appartient au jour précédent.
    if current >= start:
        return day in jours
    previous_day = (day - 1) % 7
    return current <= end and previous_day in jours


def parse_iso_utc(value: str) -> datetime:
    """ISO 8601 → datetime UTC ; un horodatage sans fuseau est refusé (ambigu)."""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("horodatage sans fuseau horaire")
    return dt.astimezone(timezone.utc)
