"""
Protocole traceur ↔ serveur (référence : docs/transition-données-serveur.pdf,
« Communication Traceur ↔ Application Mobile », sections 6 à 8).

Ce module est PUR (aucune base, aucun réseau) : il est testé seul
(tests/test_device_protocol.py) et réutilisé par l'ingestion MQTT/HTTP et le
relais par téléphone.

- Trame brute « ; » à 12 champs FIXES (§7.1) :
    id;lat;lon;bat;spd;ts;evt;value;threshold;sat;sig;cap
  les 6 premiers sont le socle commun, les 6 suivants sont facultatifs (vides).
- Codes d'événement (§7.1) : 1 décollement, 2 batterie faible, 3 vitesse
  excessive, 4 sortie de zone, 5 non-mouvement.
- Validation (§6 étape 5) : latitude/longitude dans leurs bornes, batterie ≤ 100,
  vitesse ≤ 160 km/h.
- Commandes descendantes (§7.3) : {"id","cmd","valeur","sig"}, sig = HMAC-SHA256
  (clé partagée) de « cmd|valeur » ou de « cmd » seul.
- Accusés (§7.4) : {"id","cmd","ok","detail","trackerId","sig"}, sig = HMAC de
  « ok|detail ».

Hypothèse documentée (à confirmer avec le firmware, T-DEV-ACK-FORMAT) : `ok`
est sérialisé « true »/« false » dans la chaîne signée.

Limite connue : la trame elle-même n'est ni signée ni chiffrée par le
protocole ; son authenticité repose sur le canal (identifiants MQTT par
traceur, clé du dispositif en HTTP, session du compte autorisé pour un relais).
"""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from app.core.timeutils import parse_iso_utc

FIELD_COUNT = 12
MAX_SPEED_KMH = 160.0
MAX_FRAME_LENGTH = 512

# Code numérique → événement SIREN. `stored` est la valeur du type PostgreSQL
# device_event_type ; les codes sans équivalent sont conservés sous « autre »
# avec leur code d'origine dans le payload.
EVENT_CODES: dict[str, dict[str, str]] = {
    "1": {"name": "detachment", "stored": "arrachement"},
    "2": {"name": "low_battery", "stored": "batterie_faible"},
    "3": {"name": "overspeed", "stored": "autre"},
    "4": {"name": "zone_exit", "stored": "autre"},
    "5": {"name": "no_movement", "stored": "autre"},
}

COMMAND_CODES = ("LOCALISER", "MODE", "REDEMARRER")
# NUMERO_SMS et RESET_USINE existent dans le protocole mais ne sont pas exposés
# à l'application (risque : détournement du SMS de secours, perte de calibration).
MODE_VALUES = ("WORK", "MOVE", "STANDBY")


class FrameError(ValueError):
    """Trame refusée ; `reason` est un motif stable (journaux, tests)."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class Frame:
    tracker_id: str
    lat: float
    lon: float
    battery: Optional[int]
    speed_kmh: Optional[float]
    ts: datetime
    event_code: Optional[str]
    event_value: Optional[float]
    event_threshold: Optional[float]
    satellites: Optional[int]
    signal_pct: Optional[int]
    heading: Optional[float]

    @property
    def event(self) -> Optional[dict[str, str]]:
        return EVENT_CODES.get(self.event_code) if self.event_code else None


def _opt_float(value: str, field: str) -> Optional[float]:
    if value == "":
        return None
    try:
        number = float(value)
    except ValueError:
        raise FrameError(f"{field}_invalid")
    if number != number or number in (float("inf"), float("-inf")):
        raise FrameError(f"{field}_invalid")
    return number


def _opt_int(value: str, field: str) -> Optional[int]:
    number = _opt_float(value, field)
    return None if number is None else int(round(number))


def parse_frame(raw: str) -> Frame:
    """Découpe et valide une trame brute ; lève FrameError sinon (jamais d'exception autre)."""
    if not isinstance(raw, str) or not raw or len(raw) > MAX_FRAME_LENGTH:
        raise FrameError("frame_length")
    fields = raw.strip().split(";")
    if len(fields) != FIELD_COUNT:
        raise FrameError("field_count")
    fields = [f.strip() for f in fields]
    tracker_id = fields[0]
    if not tracker_id or len(tracker_id) > 50:
        raise FrameError("id_invalid")
    lat = _opt_float(fields[1], "lat")
    lon = _opt_float(fields[2], "lon")
    if lat is None or not -90 <= lat <= 90:
        raise FrameError("lat_invalid")
    if lon is None or not -180 <= lon <= 180:
        raise FrameError("lon_invalid")
    battery = _opt_int(fields[3], "bat")
    if battery is not None and not 0 <= battery <= 100:
        raise FrameError("bat_invalid")
    speed = _opt_float(fields[4], "spd")
    if speed is not None and not 0 <= speed <= MAX_SPEED_KMH:
        raise FrameError("spd_invalid")
    try:
        ts = parse_iso_utc(fields[5])
    except (ValueError, AttributeError, TypeError):
        raise FrameError("ts_invalid")
    event_code = fields[6] or None
    if event_code is not None and event_code not in EVENT_CODES:
        raise FrameError("evt_unknown")
    signal = _opt_int(fields[10], "sig")
    if signal is not None and not 0 <= signal <= 100:
        raise FrameError("sig_invalid")
    heading = _opt_float(fields[11], "cap")
    if heading is not None and not 0 <= heading <= 360:
        raise FrameError("cap_invalid")
    satellites = _opt_int(fields[9], "sat")
    if satellites is not None and satellites < 0:
        raise FrameError("sat_invalid")
    return Frame(
        tracker_id=tracker_id,
        lat=lat,
        lon=lon,
        battery=battery,
        speed_kmh=speed,
        ts=ts,
        event_code=event_code,
        event_value=_opt_float(fields[7], "value"),
        event_threshold=_opt_float(fields[8], "threshold"),
        satellites=satellites,
        signal_pct=signal,
        heading=heading,
    )


def frame_fingerprint(raw: str) -> str:
    """Identifiant d'idempotence d'une trame relayée (même trame → même empreinte)."""
    return hashlib.sha256(raw.strip().encode()).hexdigest()


# --- Signatures (commandes et accusés) -------------------------------------------------


def _hmac(key: str, message: str) -> str:
    return hmac.new(key.encode(), message.encode(), hashlib.sha256).hexdigest()


def command_signing_input(cmd: str, valeur: Optional[str]) -> str:
    return f"{cmd}|{valeur}" if valeur else cmd


def sign_command(key: str, cmd: str, valeur: Optional[str]) -> str:
    if not key:
        raise ValueError("DEVICE_COMMAND_SIGNING_KEY absente")
    return _hmac(key, command_signing_input(cmd, valeur))


def build_command(key: str, command_id: str, cmd: str, valeur: Optional[str]) -> dict:
    """Message publié sur faucon/<id>/cmd (§7.3)."""
    return {"id": command_id, "cmd": cmd, "valeur": valeur or "", "sig": sign_command(key, cmd, valeur)}


def ack_signing_input(ok: bool, detail: str) -> str:
    return f"{'true' if ok else 'false'}|{detail}"


def sign_ack(key: str, ok: bool, detail: str) -> str:
    return _hmac(key, ack_signing_input(ok, detail))


def verify_ack(key: str, ok: bool, detail: str, sig: str) -> bool:
    if not key or not sig:
        return False
    return hmac.compare_digest(sign_ack(key, ok, detail), sig.strip().lower())


def validate_command(cmd: str, valeur: Optional[str]) -> Optional[str]:
    """Renvoie le motif de refus, ou None si la commande est acceptable."""
    if cmd not in COMMAND_CODES:
        return "command_unknown"
    if cmd == "MODE":
        if valeur not in MODE_VALUES:
            return "command_value_invalid"
    elif valeur:
        return "command_value_invalid"
    return None
