"""
Numéro de série du dispositif : `SIREN-XXXXX-XXXXX` (X alphanumérique ASCII).

Sensible à la casse : « SIREN-ab12C-… » et « SIREN-AB12C-… » sont deux numéros
différents — aucune conversion n'est faite, ni ici ni dans l'application.
Contrainte miroir en base : ck_devices_serial_format (migration 004).
"""
import re

SERIAL_RE = re.compile(r"^SIREN-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$")


class InvalidSerial(ValueError):
    pass


def parse_serial(raw: str) -> str:
    """Accepte uniquement le format exact (espaces de bord tolérés, rien d'autre)."""
    value = (raw or "").strip()
    if not SERIAL_RE.fullmatch(value):
        raise InvalidSerial(value)
    return value
