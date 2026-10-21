#!/usr/bin/env bash
# Restaure une sauvegarde dans une base CIBLE.
#
#   deploy/contabo/restore.sh <fichier.dump[.age]> [base_cible]
#
# Par défaut la cible est une base de contrôle « siren_restore_check » : la base de
# production n'est jamais écrasée sans PRODUCTION_RESTORE=oui et confirmation
# tapée (opération destructive, à n'exécuter qu'avec autorisation explicite).
# Déchiffrement : AGE_IDENTITY=/chemin/vers/cle.txt si le fichier est chiffré.
# Rien n'est supprimé avant que la sauvegarde ait été vérifiée (empreinte),
# déchiffrée et lue en entier (table des matières pg_restore).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

FILE="${1:?usage : restore.sh <fichier> [base_cible]}"
TARGET="${2:-siren_restore_check}"
[[ -f "$FILE" ]] || die "fichier introuvable : $FILE"
[[ "$TARGET" =~ ^[a-z_][a-z0-9_]*$ ]] || die "nom de base invalide : $TARGET"
if [[ "$FILE" == *.age ]]; then
  [[ -n "${AGE_IDENTITY:-}" && -r "$AGE_IDENTITY" ]] || die "AGE_IDENTITY (clé privée lisible) requis pour un fichier chiffré"
  command -v age >/dev/null || die "age absent : impossible de déchiffrer"
fi
if [[ -f "$FILE.sha256" ]]; then
  (cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" >/dev/null) || die "empreinte SHA-256 invalide"
elif [[ "${ALLOW_NO_CHECKSUM:-0}" != 1 ]]; then
  die "empreinte absente ($FILE.sha256) : ALLOW_NO_CHECKSUM=1 pour passer outre en connaissance de cause"
fi

if [[ -n "${PG_CONTAINER:-}" ]]; then
  PG_USER="${PG_USER:?}"; PROD_DB="${PG_DB:?}"
  psql_exec() { docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_USER" "$@"; }
  restore_exec() { docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_USER" "$@"; }
else
  require_env_file
  PG_USER="$(env_value POSTGRES_USER siren)"; PROD_DB="$(env_value POSTGRES_DB siren)"
  psql_exec() { compose exec -T db psql -v ON_ERROR_STOP=1 -U "$PG_USER" "$@"; }
  restore_exec() { compose exec -T db pg_restore -U "$PG_USER" "$@"; }
fi

if [[ "$TARGET" == "$PROD_DB" ]]; then
  [[ "${PRODUCTION_RESTORE:-}" == "oui" ]] || die "restauration sur la base de production refusée (PRODUCTION_RESTORE=oui requis)"
  read -r -p "Tapez le nom de la base pour confirmer l'écrasement de « $PROD_DB » : " answer
  [[ "$answer" == "$PROD_DB" ]] || die "confirmation incorrecte"
fi

# Copie de travail en clair (déchiffrée), lisible du seul propriétaire, effacée en sortie.
WORK="$(umask 077 && mktemp -d "${TMPDIR:-/tmp}/siren-restore.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
if [[ "$FILE" == *.age ]]; then
  age -d -i "$AGE_IDENTITY" -o "$WORK/restore.dump" "$FILE" || die "déchiffrement impossible : base cible intacte"
else
  cp "$FILE" "$WORK/restore.dump"
fi
restore_exec --list < "$WORK/restore.dump" >/dev/null || die "sauvegarde illisible par pg_restore : base cible intacte"

log "restauration de $(basename "$FILE") dans « $TARGET »"
psql_exec -d postgres -c "DROP DATABASE IF EXISTS \"$TARGET\" WITH (FORCE)" >/dev/null
psql_exec -d postgres -c "CREATE DATABASE \"$TARGET\"" >/dev/null
restore_exec -d "$TARGET" --no-owner --exit-on-error < "$WORK/restore.dump"
log "restauration terminée"
