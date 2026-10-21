#!/usr/bin/env bash
# Régénère data/schema.sql (et sa copie server/db_schema.sql) de façon reproductible :
#   1. base vide PostGIS jetable (Docker) ;
#   2. point de départ : la sauvegarde de production (data/*.backup.gz, schéma seul) si elle est
#      présente localement (elle est hors Git), sinon le data/schema.sql actuel ;
#   3. migrations server/migrations/NNN_*.sql via migrations/apply.py ;
#   4. pg_dump --schema-only du résultat + en-tête de portabilité (schéma « extensions »).
# Usage : scripts/db/rebuild-schema.sh   (nécessite docker, python3 et asyncpg)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP="$(find "$ROOT/data" -maxdepth 1 -name '*.backup.gz' -print 2>/dev/null | sort | head -1 || true)"
# Même image (digest) que la CI et la production : pg_dump et PostGIS identiques partout.
POSTGIS_IMAGE="${POSTGIS_IMAGE:-postgis/postgis@sha256:3f4a5d48e0be9580ed70ed618cd039ce57bbb2dd113053d3836e28513f1f87cd}"
NAME=siren-schema-rebuild
PORT=55439
WORK="$(mktemp -d)"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

docker run -d --name "$NAME" -e POSTGRES_USER=siren -e POSTGRES_PASSWORD=rebuild -e POSTGRES_DB=postgres \
  -p "127.0.0.1:$PORT:5432" "$POSTGIS_IMAGE" >/dev/null
# L'image redémarre PostgreSQL à la fin de son initialisation : attendre ce redémarrage.
until docker logs "$NAME" 2>&1 | grep -q "PostgreSQL init process complete"; do sleep 1; done
until docker exec "$NAME" psql -q -U siren -d postgres -c "SELECT 1" >/dev/null 2>&1; do sleep 1; done
docker exec "$NAME" psql -q -U siren -d postgres -c "CREATE DATABASE siren TEMPLATE template0"

if [ -n "$BACKUP" ]; then
  python3 "$ROOT/scripts/db/extract_public_schema.py" "$BACKUP" "$WORK/start.sql"
else
  echo "Aucune sauvegarde dans data/ : départ depuis data/schema.sql"
  cp "$ROOT/data/schema.sql" "$WORK/start.sql"
fi
docker cp "$WORK/start.sql" "$NAME:/tmp/start.sql"
docker exec "$NAME" psql -v ON_ERROR_STOP=1 -q -U siren -d siren -f /tmp/start.sql >/dev/null

DATABASE_URL="postgresql://siren:rebuild@127.0.0.1:$PORT/siren" python3 "$ROOT/server/migrations/apply.py"

docker exec "$NAME" pg_dump -U siren -d siren --schema-only --no-owner --no-privileges -n public > "$WORK/target.sql"
docker exec "$NAME" psql -tA -U siren -d siren -c \
  "SELECT format('INSERT INTO public.schema_migrations (version, checksum, applied_at) VALUES (%L, %L, now()) ON CONFLICT DO NOTHING;', version, checksum) FROM public.schema_migrations ORDER BY version" > "$WORK/baseline.sql"
python3 "$ROOT/scripts/db/write_schema.py" "$WORK/target.sql" "$WORK/baseline.sql" "$ROOT/data/schema.sql"
cp "$ROOT/data/schema.sql" "$ROOT/server/db_schema.sql"
echo "data/schema.sql et server/db_schema.sql régénérés."
