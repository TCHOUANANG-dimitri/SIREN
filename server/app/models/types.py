"""
Types de colonnes alignés sur le schéma PostgreSQL réel (data/schema.sql).

- Les identifiants sont des colonnes `uuid` : `UUIDStr` les manipule comme des
  chaînes côté Python (comme avant) mais les envoie typées `uuid` (sans quoi
  PostgreSQL refuse « column is of type uuid but expression is of type varchar »).
- Les énumérations sont des types PostgreSQL NOMMÉS (`alert_level`, `share_status`…)
  qui contiennent les VALEURS en minuscules (`active`, `invite`…). Par défaut,
  SQLAlchemy inventerait un nom (`alertlevel`) et stockerait le NOM du membre
  (`ACTIVE`) : `pg_enum` corrige les deux et ne crée jamais le type (il existe déjà).
"""
import enum
from typing import Type

from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID

UUIDStr = UUID(as_uuid=False)


def pg_enum(enum_cls: Type[enum.Enum], name: str) -> SAEnum:
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda members: [m.value for m in members],
        create_type=False,
        validate_strings=True,
    )
