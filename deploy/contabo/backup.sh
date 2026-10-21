#!/usr/bin/env bash
# Sauvegarde logique de la base (pg_dump format custom), chiffrée si une clé age est fournie.
#
#   deploy/contabo/backup.sh [daily|weekly|monthly|pre-deploy]
#
# Rétention : 7 quotidiennes, 4 hebdomadaires, 6 mensuelles, 5 avant-déploiement.
# Planification (crontab de l'utilisateur deploy, voir DEPLOIEMENT_CONTABO.md) :
#   15 2 * * *  .../backup.sh daily      ; 30 2 * * 0 .../backup.sh weekly ; 45 2 1 * * .../backup.sh monthly
# Variables : BACKUP_DIR, BACKUP_AGE_RECIPIENT (clé publique age), BACKUP_RCLONE_REMOTE (copie hors site).
# Mode local (tests) : PG_CONTAINER=<conteneur> PG_USER=... PG_DB=... sans fichier .env.prod.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
umask 077

KIND="${1:-daily}"
case "$KIND" in daily) KEEP=7 ;; weekly) KEEP=4 ;; monthly) KEEP=6 ;; pre-deploy) KEEP=5 ;; *) die "type inconnu : $KIND" ;; esac

if [[ -n "${PG_CONTAINER:-}" ]]; then
  PG_USER="${PG_USER:?}"; PG_DB="${PG_DB:?}"
  dump() { docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner; }
  toc() { docker exec -i "$PG_CONTAINER" pg_restore --list; }
  BACKUP_DIR="${BACKUP_DIR:?}"; RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"; REMOTE="${BACKUP_RCLONE_REMOTE:-}"
else
  require_env_file
  PG_USER="$(env_value POSTGRES_USER siren)"; PG_DB="$(env_value POSTGRES_DB siren)"
  dump() { compose exec -T db pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner; }
  toc() { compose exec -T db pg_restore --list; }
  BACKUP_DIR="$(env_value BACKUP_DIR /var/backups/siren)"; RECIPIENT="$(env_value BACKUP_AGE_RECIPIENT)"; REMOTE="$(env_value BACKUP_RCLONE_REMOTE)"
fi

mkdir -p "$BACKUP_DIR/$KIND"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$BACKUP_DIR/$KIND/siren-$STAMP.dump"
TMP="$BASE.partial"
# Échec à n'importe quelle étape : ni copie en clair (.partial), ni fichier chiffré
# tronqué laissés derrière (list_backups les prendrait pour des sauvegardes).
finished=0
cleanup() { [[ "$finished" == 1 ]] || rm -f "$TMP" "$BASE.age" "$BASE.age.sha256"; }
trap cleanup EXIT

dump > "$TMP"
# Une sauvegarde vide ou tronquée n'est jamais conservée comme valide.
[[ -s "$TMP" ]] || die "sauvegarde vide"
head -c 5 "$TMP" | grep -q PGDMP || die "format pg_dump inattendu"
# Lisible en entier par pg_restore AVANT chiffrement : contrôle d'intégrité sur le
# serveur, qui ne détient pas la clé privée age (le test de restauration complet des
# sauvegardes chiffrées se fait là où se trouve la clé — DEPLOIEMENT_CONTABO.md §8).
toc < "$TMP" >/dev/null || die "sauvegarde illisible par pg_restore"

if [[ -n "$RECIPIENT" ]]; then
  command -v age >/dev/null || die "age absent alors que BACKUP_AGE_RECIPIENT est défini"
  age -r "$RECIPIENT" -o "$BASE.age" "$TMP"
  rm -f "$TMP"
  FINAL="$BASE.age"
else
  log "ATTENTION : sauvegarde NON chiffrée (BACKUP_AGE_RECIPIENT vide) — accès limité au propriétaire (600)"
  mv "$TMP" "$BASE"
  FINAL="$BASE"
fi
# Empreinte par nom relatif : vérifiable après copie hors site.
(cd "$(dirname "$FINAL")" && sha256sum "$(basename "$FINAL")" > "$(basename "$FINAL").sha256")
finished=1
log "sauvegarde $KIND : $FINAL ($(du -h "$FINAL" | cut -f1))"

# Rétention : on garde les KEEP plus récentes de ce type.
mapfile -t OLD < <(list_backups "$BACKUP_DIR/$KIND" | tail -n +$((KEEP + 1)))
for file in "${OLD[@]}"; do rm -f "$file" "$file.sha256"; done

if [[ -n "$REMOTE" ]]; then
  command -v rclone >/dev/null || die "rclone absent alors que BACKUP_RCLONE_REMOTE est défini"
  # Copie sans suppression distante (une suppression locale, accidentelle ou malveillante,
  # ne se propage pas) : la rétention hors site relève de la règle de cycle de vie du
  # stockage (T-BACKUP-OFFSITE).
  rclone copy "$BACKUP_DIR/$KIND" "$REMOTE/$KIND" --include 'siren-*' && log "copie hors site : $REMOTE/$KIND"
fi
