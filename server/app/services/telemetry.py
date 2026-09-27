"""
Règles pures de l'ingestion de télémétrie (testables sans base).

Le dispositif peut renvoyer un lot en double (nouvelle tentative GSM), en
retard (lot bufferisé hors couverture) ou dans le désordre : chaque point est
identifié par (enfant, horodatage dispositif), qui fait foi — jamais l'heure
de réception.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable, List, Optional, Sequence

from app.core.timeutils import parse_iso_utc

RANK = {"veille": 0, "prealerte": 1, "urgence": 2, "disparition": 3}


@dataclass(frozen=True)
class AcceptedPoint:
    index: int
    ts: datetime


@dataclass(frozen=True)
class BatchTriage:
    accepted: List[AcceptedPoint]
    rejected: int
    duplicates: int


def triage_batch(
    timestamps: Sequence[str],
    already_stored: Iterable[datetime],
    now: datetime,
    max_future_skew_s: int,
) -> BatchTriage:
    """Classe les points d'un lot : acceptés (triés par date), rejetés (invalides / futurs), doublons."""
    known = set(already_stored)
    seen: set = set()
    accepted: List[AcceptedPoint] = []
    rejected = duplicates = 0
    limit = now + timedelta(seconds=max_future_skew_s)
    for index, raw in enumerate(timestamps):
        try:
            ts = parse_iso_utc(raw)
        except (ValueError, AttributeError):
            rejected += 1
            continue
        if ts > limit:
            rejected += 1
            continue
        if ts in known or ts in seen:
            duplicates += 1
            continue
        seen.add(ts)
        accepted.append(AcceptedPoint(index, ts))
    accepted.sort(key=lambda p: p.ts)
    return BatchTriage(accepted, rejected, duplicates)


def should_rescore(latest_new: Optional[datetime], previous_latest: Optional[datetime]) -> bool:
    """Un lot entièrement antérieur au dernier point connu complète l'historique sans rescorer le présent."""
    if latest_new is None:
        return False
    return previous_latest is None or latest_new > previous_latest


def should_raise_alert(previous_state: Optional[str], new_state: str) -> bool:
    """Une alerte par montée de niveau (veille → pré-alerte, pré-alerte → urgence), pas une par point."""
    if new_state not in ("prealerte", "urgence"):
        return False
    return RANK.get(new_state, 0) > RANK.get(previous_state or "veille", 0)


def fix_quality_for(accuracy_m: Optional[float], max_accurate_m: float) -> str:
    """Précision inconnue ou dégradée → « estimée » (à valider avec le pôle Dispositif)."""
    if accuracy_m is None or accuracy_m > max_accurate_m:
        return "estimee"
    return "gps_recent"
