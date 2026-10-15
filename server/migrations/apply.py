"""
Applique les migrations SQL de server/migrations dans l'ordre, une seule fois.

    python migrations/apply.py            # applique ce qui manque
    python migrations/apply.py --status   # affiche l'état sans rien modifier

- Suivi dans la table public.schema_migrations (version, empreinte SHA-256, date).
- Une migration déjà appliquée dont le fichier a changé est REFUSÉE (empreinte
  différente) : on n'édite jamais une migration publiée, on en ajoute une.
- Base neuve créée depuis data/schema.sql : les migrations qu'il contient y sont
  déjà enregistrées, rien n'est rejoué.
- Base Supabase existante (sans schema_migrations) : 001 → 003 sont idempotentes
  et sont appliquées puis enregistrées.

Connexion : DATABASE_URL (format SQLAlchemy accepté : postgresql+asyncpg://…).
Aucune donnée n'est supprimée par les migrations livrées (voir data/SCHEMA.md).
"""
import asyncio
import hashlib
import os
import re
import sys
from pathlib import Path

import asyncpg

HERE = Path(__file__).resolve().parent
PATTERN = re.compile(r"^(\d{3})_[a-z0-9_]+\.sql$")


def migration_files() -> list[tuple[str, Path]]:
    files = sorted((m.group(1), p) for p in HERE.iterdir() if (m := PATTERN.match(p.name)))
    return files


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dsn() -> str:
    url = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_URL_SYNC")
    if not url:
        sys.exit("DATABASE_URL manquant")
    return re.sub(r"^postgresql\+\w+://", "postgresql://", url)


async def connect_with_retry(attempts: int = 30, delay_s: float = 2.0) -> asyncpg.Connection:
    """La base peut redémarrer juste après son initialisation : quelques essais avant d'abandonner."""
    for attempt in range(1, attempts + 1):
        try:
            return await asyncpg.connect(dsn(), server_settings={"search_path": "public, extensions"})
        except (OSError, asyncpg.CannotConnectNowError) as error:
            if attempt == attempts:
                raise
            print(f"base indisponible ({type(error).__name__}), nouvel essai {attempt}/{attempts}")
            await asyncio.sleep(delay_s)
    raise RuntimeError("inaccessible")


async def ensure_table(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
            version     VARCHAR(10) PRIMARY KEY,
            checksum    CHAR(64) NOT NULL,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    await conn.execute("ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY")


async def main(status_only: bool) -> int:
    # Les extensions (PostGIS, uuid-ossp) vivent dans le schéma « extensions » (convention Supabase).
    conn = await connect_with_retry()
    try:
        await ensure_table(conn)
        applied = {r["version"]: r["checksum"] for r in await conn.fetch("SELECT version, checksum FROM public.schema_migrations")}
        pending = []
        for version, path in migration_files():
            digest = checksum(path)
            if version in applied:
                if applied[version] != digest:
                    print(f"ERREUR {path.name} : déjà appliquée mais modifiée depuis (empreinte différente)")
                    return 2
                print(f"ok      {path.name}")
            else:
                pending.append((version, path, digest))
                print(f"à faire {path.name}")
        if status_only or not pending:
            return 0
        for version, path, digest in pending:
            # Chaque fichier gère ses propres transactions (ALTER TYPE … ADD VALUE ne peut pas
            # être utilisé dans la transaction qui l'ajoute) ; asyncpg exécute le script tel quel.
            await conn.execute(path.read_text(encoding="utf-8"))
            await conn.execute(
                "INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)", version, digest
            )
            print(f"appliquée {path.name}")
        return 0
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main("--status" in sys.argv)))
