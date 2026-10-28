#!/usr/bin/env bash
# Déploie la version donnée sur le serveur (exécuté SUR le VPS, par la CD ou à la main).
#
#   deploy/contabo/deploy.sh v1.2.0
#
# Étapes : sauvegarde préalable → images de la version → migrations (propriétaire
# du schéma) → rôle applicatif (droits sur les tables à jour) → redémarrage → contrôle de disponibilité
# (/health/ready : version attendue ET base joignable avec le rôle applicatif).
# Échec : retour automatique à la version précédente (les migrations sont
# additives : l'ancienne version reste compatible).
# La base n'est JAMAIS restaurée automatiquement (décision humaine, restore.sh).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

VERSION="${1:-}"
[[ -n "$VERSION" ]] || die "usage : deploy.sh vX.Y.Z"
valid_version "$VERSION" || die "version invalide : $VERSION (attendu vX.Y.Z)"
require_env_file
acquire_lock

PREVIOUS="$(real_version "$(env_value SIREN_VERSION)")"
DOMAIN="$(env_value DOMAIN)"
HEALTH_URL="${HEALTH_URL:-https://${DOMAIN}/health/ready}"
# Une version antérieure peut ne pas connaître /health/ready : son retour est contrôlé sur /health.
ROLLBACK_HEALTH_URL="${HEALTH_URL%/ready}"
PG_USER="$(env_value POSTGRES_USER siren)"
PG_DB="$(env_value POSTGRES_DB siren)"
APP_USER="$(env_value APP_DB_USER siren_app)"
APP_PASSWORD="$(env_value APP_DB_PASSWORD)"
[[ "$APP_USER" =~ ^[a-z_][a-z0-9_]*$ && "$PG_DB" =~ ^[a-z_][a-z0-9_]*$ ]] || die "APP_DB_USER / POSTGRES_DB : identifiants SQL simples attendus"
# Transmis à psql par l'entrée standard (jamais en argument, visible dans `ps`) : alphabet
# restreint, celui des secrets générés selon DEPLOIEMENT_CONTABO.md §4.
[[ "$APP_PASSWORD" =~ ^[A-Za-z0-9._~-]{32,}$ ]] || die "APP_DB_PASSWORD : au moins 32 caractères parmi lettres, chiffres et . _ ~ -"
log "déploiement $VERSION (précédente : ${PREVIOUS:-aucune})"

if compose ps --status running db >/dev/null 2>&1 && [[ -n "$(compose ps -q db)" ]]; then
  log "sauvegarde avant déploiement"
  "$DEPLOY_DIR/backup.sh" pre-deploy
fi

# La version n'est inscrite dans .env.prod qu'une fois en service : un échec de
# téléchargement ou de migration laisse le fichier — donc la cible d'un prochain retour
# arrière — inchangé. Compose lit SIREN_VERSION de l'environnement (prioritaire sur --env-file).
export SIREN_VERSION="$VERSION"
# PULL=0 : images déjà présentes localement (répétition locale uniquement).
if [[ "${PULL:-1}" == 1 ]]; then
  compose pull --quiet api worker beat migration
fi

log "base et migrations"
compose up -d db redis
for _ in $(seq 1 30); do
  compose exec -T db pg_isready -h 127.0.0.1 -U "$PG_USER" >/dev/null 2>&1 && break
  sleep 2
done
compose run --rm migration

log "rôle applicatif"
{
  # Une erreur ne doit pas recopier l'instruction (et son mot de passe) dans le journal PostgreSQL.
  echo "SET log_min_error_statement = 'panic';"
  echo "SET log_statement = 'none';"
  printf '\\set app_user %s\n\\set app_password %s\n\\set db_name %s\n' "$APP_USER" "$APP_PASSWORD" "$PG_DB"
  cat "$DEPLOY_DIR/sql/app_role.sql"
} | compose exec -T db psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" -f - >/dev/null

log "démarrage des services"
# En mode Nginx, supprimer tout conteneur proxy Caddy résiduel d'une exécution antérieure.
if [[ "$(env_value SIREN_PROXY_MODE caddy)" != "caddy" ]]; then
  docker rm -f server-proxy-1 >/dev/null 2>&1 || true
fi
# Un échec de démarrage (ex. API jamais saine) doit mener au retour arrière, pas
# interrompre le script : sous `set -e`, l'erreur de compose l'arrêterait avant.
started=1
if [[ "$(env_value SIREN_PROXY_MODE caddy)" == "caddy" ]]; then
  compose up -d --remove-orphans || started=0
else
  compose up -d --remove-orphans api worker beat || started=0
fi

if [[ "$started" == 1 ]] && wait_healthy "$HEALTH_URL" "$VERSION"; then
  set_version "$VERSION"
  echo "$VERSION" > "$STATE_DIR/current"
  if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$VERSION" ]]; then
    echo "$PREVIOUS" > "$STATE_DIR/previous"
  fi
  log "OK : $VERSION en service ($HEALTH_URL)"
  exit 0
fi

log "contrôle de disponibilité en échec : retour à ${PREVIOUS:-aucune}"
if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$VERSION" ]]; then
  export SIREN_VERSION="$PREVIOUS"
  if [[ "$(env_value SIREN_PROXY_MODE caddy)" == "caddy" ]]; then
    compose up -d --remove-orphans || log "redémarrage de $PREVIOUS signalé en échec par compose : contrôle de santé"
  else
    compose up -d --remove-orphans api worker beat || log "redémarrage de $PREVIOUS signalé en échec par compose : contrôle de santé"
  fi
  wait_healthy "$ROLLBACK_HEALTH_URL" "$PREVIOUS" || die "le retour arrière n'est pas sain non plus : intervention manuelle (ROLLBACK dans DEPLOIEMENT_CONTABO.md)"
  die "déploiement $VERSION annulé, $PREVIOUS rétablie"
fi
die "déploiement $VERSION en échec et aucune version précédente à rétablir"
