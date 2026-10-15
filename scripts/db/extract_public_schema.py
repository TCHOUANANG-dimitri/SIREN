"""
Extrait la DÉFINITION du schéma public d'une sauvegarde de cluster Supabase
(pg_dumpall, gzip) — jamais les données (blocs COPY ignorés), ni les rôles,
ni les droits. Le résultat se restaure sur une base PostGIS vide.

    python3 scripts/db/extract_public_schema.py data/<fichier>.backup.gz sortie.sql
"""
import gzip
import re
import sys

PRELUDE = """CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path = public, extensions;
DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET search_path = public, extensions', current_database()); END $$;
"""


def main(source: str, target: str) -> None:
    text = gzip.open(source, "rt", encoding="utf-8").read()
    database = text[text.index('-- Database "postgres" dump'):]
    blocks = re.split(r"\n(?=--\n-- (?:Name|Data for Name): )", database)
    kept = []
    for block in blocks:
        header = re.match(r"--\n-- (Name|Data for Name): .*?; Type: (.*?); Schema: (.*?); Owner: .*?\n", block)
        if not header or header.group(1) != "Name" or header.group(3) != "public":
            continue
        if header.group(2) in ("ACL", "DEFAULT ACL"):
            continue
        kept.append("\n".join(line for line in block.strip().splitlines() if "OWNER TO" not in line))
    with open(target, "w", encoding="utf-8") as out:
        out.write(PRELUDE + "\n\n".join(kept) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
