#!/usr/bin/env bash
# Régénère data/schema.sql (et sa copie server/db_schema.sql) de façon reproductible :
#   1. base vide PostGIS jetable (Docker) ;
#   2. restauration du schéma public de la sauvegarde de production (data/*.backup.gz, sans données) ;
#   3. migrations server/migrations/NNN_*.sql via migrations/apply.py ;
#   4. pg_dump --schema-only du résultat + en-tête de portabilité (schéma « extensions »).
# Usage : scripts/db/rebuild-schema.sh   (nécessite docker, python3 et asyncpg)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP="$(ls "$ROOT"/data/*.backup.gz | head -1)"
NAME=siren-schema-rebuild
PORT=55439
WORK="$(mktemp -d)"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

docker run -d --name "$NAME" -e POSTGRES_USER=siren -e POSTGRES_PASSWORD=rebuild -e POSTGRES_DB=postgres \
  -p "127.0.0.1:$PORT:5432" postgis/postgis:15-3.4 >/dev/null
# L'image redémarre PostgreSQL à la fin de son initialisation : attendre ce redémarrage.
until docker logs "$NAME" 2>&1 | grep -q "PostgreSQL init process complete"; do sleep 1; done
until docker exec "$NAME" psql -q -U siren -d postgres -c "SELECT 1" >/dev/null 2>&1; do sleep 1; done
docker exec "$NAME" psql -q -U siren -d postgres -c "CREATE DATABASE siren TEMPLATE template0"

python3 "$ROOT/scripts/db/extract_public_schema.py" "$BACKUP" "$WORK/prod_public.sql"
docker cp "$WORK/prod_public.sql" "$NAME:/tmp/prod_public.sql"
docker exec "$NAME" psql -v ON_ERROR_STOP=1 -q -U siren -d siren -f /tmp/prod_public.sql >/dev/null

DATABASE_URL="postgresql://siren:rebuild@127.0.0.1:$PORT/siren" python3 "$ROOT/server/migrations/apply.py"

docker exec "$NAME" pg_dump -U siren -d siren --schema-only --no-owner --no-privileges -n public > "$WORK/target.sql"
docker exec "$NAME" psql -tA -U siren -d siren -c \
  "SELECT format('INSERT INTO public.schema_migrations (version, checksum, applied_at) VALUES (%L, %L, now()) ON CONFLICT DO NOTHING;', version, checksum) FROM public.schema_migrations ORDER BY version" > "$WORK/baseline.sql"
python3 "$ROOT/scripts/db/write_schema.py" "$WORK/target.sql" "$WORK/baseline.sql" "$ROOT/data/schema.sql"
cp "$ROOT/data/schema.sql" "$ROOT/server/db_schema.sql"
echo "data/schema.sql et server/db_schema.sql régénérés."
