"""
Cohérence ORM ↔ schéma SQL de référence (data/schema.sql), sans base de données.
Garde-fou contre la régression constatée le 15/10/2026 : identifiants envoyés en
varchar vers des colonnes uuid, types énumérés inexistants (« alertlevel »).
"""
import re
from pathlib import Path

import pytest
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import ARRAY, UUID

import app.models  # noqa: F401 — enregistre tous les modèles
from app.core.database import Base

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = (ROOT / "data" / "schema.sql").read_text(encoding="utf-8")


def sql_tables() -> dict[str, dict[str, str]]:
    tables: dict[str, dict[str, str]] = {}
    for m in re.finditer(r"CREATE TABLE public\.(\w+) \((.*?)\n\)", SCHEMA, re.S):
        cols = {}
        for line in m.group(2).splitlines():
            line = line.strip().rstrip(",")
            if not line or line.startswith("CONSTRAINT"):
                continue
            name, coltype = line.split(" ", 1)
            cols[name] = coltype
        tables[m.group(1)] = cols
    return tables


def sql_enums() -> dict[str, list[str]]:
    return {
        m.group(1): re.findall(r"'([^']+)'", m.group(2))
        for m in re.finditer(r"CREATE TYPE public\.(\w+) AS ENUM \((.*?)\);", SCHEMA, re.S)
    }


TABLES = sql_tables()
ENUMS = sql_enums()


def test_schema_files_are_identical():
    assert (ROOT / "server" / "db_schema.sql").read_text(encoding="utf-8") == SCHEMA


def sql_name(key: str) -> str:
    return key.split(".", 1)[-1]  # « public.positions » → « positions »


@pytest.mark.parametrize("table", sorted(Base.metadata.tables), ids=str)
def test_orm_table_and_columns_exist(table):
    assert sql_name(table) in TABLES, f"table {table} absente de data/schema.sql"
    missing = [c.name for c in Base.metadata.tables[table].columns if c.name not in TABLES[sql_name(table)]]
    assert missing == [], f"{table} : colonnes absentes du schéma {missing}"


@pytest.mark.parametrize("table", sorted(Base.metadata.tables), ids=str)
def test_orm_types_match_sql(table):
    for column in Base.metadata.tables[table].columns:
        sql_type = TABLES[sql_name(table)][column.name]
        col_type = column.type.item_type if isinstance(column.type, ARRAY) else column.type
        if sql_type.startswith("uuid"):
            assert isinstance(column.type, UUID), f"{table}.{column.name} : uuid en base, pas en ORM"
        if isinstance(col_type, SAEnum):
            assert col_type.name in ENUMS, f"{table}.{column.name} : type {col_type.name} inexistant"
            assert sql_type.split()[0].rstrip("[]") in (col_type.name, f"public.{col_type.name}")
            assert set(col_type.enums) <= set(ENUMS[col_type.name]), f"{table}.{column.name} : valeurs inconnues en base"
