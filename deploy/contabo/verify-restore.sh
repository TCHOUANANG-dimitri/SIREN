#!/usr/bin/env bash
# Test de restauration : la dernière sauvegarde est restaurée dans une base de
# contrôle puis vérifiée (tables clés présentes et comptées, migrations identiques à
# la source, PostGIS opérationnel), puis la base de contrôle est supprimée.
# À planifier chaque semaine (crontab) ; un échec doit alerter l'exploitant.
#
#   deploy/contabo/verify-restore.sh [fichier]   # défaut : sauvegarde quotidienne la plus récente
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [[ -n "${PG_CONTAINER:-}" ]]; then
  PG_USER="${PG_USER:?}"; PG_DB="${PG_DB:?}"; BACKUP_DIR="${BACKUP_DIR:?}"
  q() { docker exec -i "$PG_CONTAINER" psql -At -v ON_ERROR_STOP=1 -U "$PG_USER" "$@"; }
else
  require_env_file
  PG_USER="$(env_value POSTGRES_USER siren)"; PG_DB="$(env_value POSTGRES_DB siren)"; BACKUP_DIR="$(env_value BACKUP_DIR /var/backups/siren)"
  q() { compose exec -T db psql -At -v ON_ERROR_STOP=1 -U "$PG_USER" "$@"; }
fi

FILE="${1:-$(list_backups "$BACKUP_DIR/daily" | head -n1)}"
[[ -n "$FILE" ]] || die "aucune sauvegarde trouvée dans $BACKUP_DIR/daily"
CHECK_DB=siren_restore_check
if [[ "$FILE" == *.age && -z "${AGE_IDENTITY:-}" ]]; then
  # Clé privée volontairement absente du serveur : ce test s'exécute hors serveur.
  die "sauvegarde chiffrée et AGE_IDENTITY absent : test de restauration à lancer là où se trouve la clé privée (DEPLOIEMENT_CONTABO.md §8)"
fi

# Base de contrôle (copie complète des données) supprimée même en cas d'échec.
trap 'q -d postgres -c "DROP DATABASE IF EXISTS $CHECK_DB WITH (FORCE)" >/dev/null 2>&1 || true' EXIT
"$DEPLOY_DIR/restore.sh" "$FILE" "$CHECK_DB"

fail=0
for table in users children devices positions alerts schema_migrations otp_challenges device_commands; do
  restored="$(q -d "$CHECK_DB" -c "SELECT count(*) FROM public.$table" 2>/dev/null || echo ABSENTE)"
  [[ "$restored" == ABSENTE ]] && { log "table absente après restauration : $table"; fail=1; continue; }
  log "  $table : $restored ligne(s)"
done
# Une sauvegarde sans données passe les contrôles de structure : comparaison avec la source.
users_src="$(q -d "$PG_DB" -c "SELECT count(*) FROM public.users")"
users_dst="$(q -d "$CHECK_DB" -c "SELECT count(*) FROM public.users" 2>/dev/null || echo 0)"
if [[ "$users_src" -gt 0 && "$users_dst" -eq 0 ]]; then
  log "aucun compte restauré alors que la source en compte $users_src"; fail=1
fi
migrations_src="$(q -d "$PG_DB" -c "SELECT string_agg(version, ',' ORDER BY version) FROM schema_migrations")"
migrations_dst="$(q -d "$CHECK_DB" -c "SELECT string_agg(version, ',' ORDER BY version) FROM schema_migrations")"
[[ "$migrations_src" == "$migrations_dst" ]] || { log "migrations différentes : source=$migrations_src restaurée=$migrations_dst"; fail=1; }
postgis="$(q -d "$CHECK_DB" -c "SELECT extensions.postgis_lib_version()" 2>/dev/null || echo absent)"
[[ "$postgis" != absent ]] || { log "PostGIS absent dans la base restaurée"; fail=1; }

[[ "$fail" == 0 ]] || die "test de restauration EN ÉCHEC pour $(basename "$FILE")"
log "test de restauration réussi : $(basename "$FILE") (migrations $migrations_dst, PostGIS $postgis)"
