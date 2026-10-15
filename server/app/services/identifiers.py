"""
Identifiant d'invitation (email ou téléphone) — mêmes règles que
src/features/sharing/inviteRules.ts côté application.
"""
import re
from typing import Literal, Optional

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PHONE_RE = re.compile(r"^\+?\d{8,15}$")

Kind = Literal["email", "phone"]


def normalize_identifier(raw: str) -> tuple[str, Optional[Kind]]:
    value = raw.strip()
    if "@" in value:
        email = value.lower()
        return email, "email" if EMAIL_RE.match(email) else None
    phone = re.sub(r"[\s.\-()]", "", value)
    return phone, "phone" if PHONE_RE.match(phone) else None


def same_phone(a: Optional[str], b: Optional[str]) -> bool:
    """Mêmes chiffres, ou l'un est l'autre précédé d'un indicatif pays (≤ 3 chiffres)."""
    if not a or not b:
        return False
    da, db = re.sub(r"\D", "", a), re.sub(r"\D", "", b)
    if len(da) < 8 or len(db) < 8:
        return False
    if da == db:
        return True
    short, long = (da, db) if len(da) < len(db) else (db, da)
    return long.endswith(short) and len(long) - len(short) <= 3


def is_self(identifier: str, kind: Kind, user) -> bool:
    if kind == "email":
        return identifier == (user.email or "").strip().lower()
    return same_phone(identifier, user.telephone)
