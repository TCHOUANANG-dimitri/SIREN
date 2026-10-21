"""Assemble data/schema.sql : en-tête de portabilité + pg_dump --schema-only + migrations déjà incluses."""
import re
import sys

# Lignes propres à l'exécution de pg_dump, retirées pour que le fichier soit reproductible
# (contrôlé en CI par `git diff --exit-code`) : version du serveur et de pg_dump,
# et jetons aléatoires \restrict / \unrestrict des pg_dump récents (≥ 15.14).
VOLATILE = re.compile(r"^(-- Dumped (from database|by pg_dump) version .*|\\(un)?restrict \S+)\n", re.MULTILINE)

HEADER = '''-- =============================================================================
-- SIREN — Schéma PostgreSQL / PostGIS reconstitué (base « siren »)
--
-- Source : sauvegarde Supabase du 25/09/2026 (data/*.backup.gz, schéma public,
-- AUCUNE donnée) + migrations server/migrations/NNN_*.sql.
-- GÉNÉRÉ par scripts/db/rebuild-schema.sh (pg_dump --schema-only) : ne pas
-- modifier à la main — ajouter une migration puis régénérer.
-- Documentation complète : data/SCHEMA.md.
--
-- Usage : base NEUVE uniquement (PostgreSQL >= 15, PostGIS >= 3.4)
--   psql -v ON_ERROR_STOP=1 -d siren -f data/schema.sql
-- Base existante : python server/migrations/apply.py
-- =============================================================================

-- Extensions dans le schéma « extensions » (convention Supabase, conservée pour
-- que la même définition serve en production et en conteneur).
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
    -- L'image postgis/postgis installe PostGIS dans « public » à la création de la base.
    -- Sur une base encore vide, on le réinstalle dans « extensions » (PostGIS n'est pas relocalisable).
    IF EXISTS (
        SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = 'postgis' AND n.nspname <> 'extensions'
    ) THEN
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys') THEN
            RAISE EXCEPTION 'PostGIS est installé hors du schéma extensions sur une base non vide : utiliser server/migrations/apply.py';
        END IF;
        DROP EXTENSION IF EXISTS postgis_tiger_geocoder CASCADE;
        DROP EXTENSION IF EXISTS postgis_topology CASCADE;
        DROP EXTENSION IF EXISTS fuzzystrmatch CASCADE;
        DROP EXTENSION IF EXISTS postgis CASCADE;
    END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Le code serveur appelle ST_*, uuid_generate_v4()… sans préfixe de schéma.
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET search_path = public, extensions', current_database());
EXCEPTION WHEN insufficient_privilege THEN
    -- Supabase : le search_path inclut déjà « extensions » ; droit non nécessaire.
    RAISE NOTICE 'search_path de la base non modifié (droits insuffisants)';
END $$;
SET search_path = public, extensions;

'''


def main(dump: str, baseline: str, target: str) -> None:
    body = VOLATILE.sub("", open(dump, encoding="utf-8").read())
    body = body.replace("CREATE SCHEMA public;", "CREATE SCHEMA IF NOT EXISTS public;", 1)
    body = body.replace("COMMENT ON SCHEMA public IS 'standard public schema';\n", "")
    inserts = open(baseline, encoding="utf-8").read().strip()
    footer = (
        "\n-- Migrations déjà intégrées à ce schéma (server/migrations/apply.py ne les rejouera pas).\n"
        "SET search_path = public, extensions;\n" + inserts + "\n"
    )
    with open(target, "w", encoding="utf-8") as out:
        out.write(HEADER + body + footer)


if __name__ == "__main__":
    main(*sys.argv[1:4])
