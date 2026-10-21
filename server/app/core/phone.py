"""
Numéros de téléphone : normalisation au format international E.164.

Le numéro est obligatoire pour tout compte (CDC + exigence D). Il est validé
avec libphonenumber (`phonenumbers`) selon le plan de numérotation du pays :
aucune longueur n'est supposée. Un numéro saisi sans indicatif est interprété
dans la région par défaut (Cameroun), configurable par PHONE_DEFAULT_REGION.
"""
import phonenumbers

from app.core.config import settings


class InvalidPhone(ValueError):
    """Numéro absent, mal formé ou invalide pour son pays."""


def normalize_phone(raw: str | None, region: str | None = None) -> str:
    if raw is None or not raw.strip():
        raise InvalidPhone("Numéro de téléphone requis")
    try:
        parsed = phonenumbers.parse(raw.strip(), region or settings.PHONE_DEFAULT_REGION)
    except phonenumbers.NumberParseException as error:
        raise InvalidPhone("Numéro de téléphone mal formé") from error
    if not phonenumbers.is_valid_number(parsed):
        raise InvalidPhone("Numéro de téléphone invalide")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def mask_phone(e164: str | None) -> str:
    """Affichage partiel pour les messages et journaux : +2376••••••12."""
    if not e164:
        return ""
    return f"{e164[:5]}{'•' * max(0, len(e164) - 7)}{e164[-2:]}"
