#!/usr/bin/env bash
# Fonctions communes aux scripts d'exploitation (sourcé, jamais exécuté seul).
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DEPLOY_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env.prod}"
STATE_DIR="${STATE_DIR:-$DEPLOY_DIR/state}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERREUR : $*" >&2; exit 1; }

require_env_file() {
  [[ -f "$ENV_FILE" ]] || die "fichier d'environnement absent : $ENV_FILE (modèle : env.prod.example)"
  local mode
  mode="$(stat -c '%a' "$ENV_FILE")"
  [[ "$mode" == "600" || "$mode" == "400" ]] || die "$ENV_FILE doit être en 600 (actuel : $mode)"
  # Valeurs d'exemple encore présentes : refus (seuls les NOMS des variables sont affichés).
  # SIREN_VERSION est exclue : deploy.sh la remplace lui-même au premier déploiement.
  local placeholders
  placeholders="$(grep -E '^[A-Z_]+=(a-remplacer|.*exemple)' "$ENV_FILE" | grep -v '^SIREN_VERSION=' | cut -d= -f1 | tr '\n' ' ' || true)"
  [[ -z "$placeholders" || "${ALLOW_EXAMPLE_VALUES:-0}" == 1 ]] || die "valeurs d'exemple à remplacer dans $ENV_FILE : $placeholders"
}

# Lit UNE variable du fichier d'environnement sans l'afficher ni exporter le reste.
# Clé absente : valeur par défaut (2e argument) ou chaîne vide — jamais une sortie
# silencieuse du script (set -e + pipefail sur l'échec de grep).
env_value() {
  local key="$1" default="${2-}" value
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
  # Guillemets entourants retirés, comme le fait docker compose.
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  printf '%s' "${value:-$default}"
}

# Une seule opération d'exploitation à la fois (CD + exécution manuelle, SSH coupé…).
acquire_lock() {
  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/lock"
  flock -n 9 || die "une autre opération (déploiement ou retour arrière) est en cours"
}

valid_version() {
  [[ "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?$ ]]
}

# Valeur d'exemple du modèle : jamais une version de référence pour un retour arrière.
real_version() {
  [[ -n "$1" && "$1" != v0.0.0-exemple ]] && printf '%s' "$1"
  return 0
}

# COMPOSE_EXTRA : surcouche supplémentaire (répétition locale uniquement, ex. ports du proxy).
compose() {
  local extra=()
  [[ -n "${COMPOSE_EXTRA:-}" ]] && extra=(-f "$COMPOSE_EXTRA")
  docker compose -f "$REPO_DIR/server/docker-compose.yml" -f "$DEPLOY_DIR/docker-compose.prod.yml" "${extra[@]}" \
    --env-file "$ENV_FILE" "$@"
}

# Remplace SIREN_VERSION dans le fichier d'environnement (déploiement / retour arrière).
set_version() {
  local version="$1"
  valid_version "$version" || die "version invalide : $version (attendu vX.Y.Z)"
  sed -i "s/^SIREN_VERSION=.*/SIREN_VERSION=${version}/" "$ENV_FILE"
}

# Sauvegardes d'un dossier, de la plus récente à la plus ancienne (noms générés par backup.sh).
list_backups() {
  find "$1" -maxdepth 1 -type f \( -name 'siren-*.dump' -o -name 'siren-*.dump.age' \) -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | cut -d' ' -f2-
}

wait_healthy() {
  local url="$1" expected="$2" tries="${3:-30}" body="" code=""
  mkdir -p "$STATE_DIR"
  for _ in $(seq 1 "$tries"); do
    # shellcheck disable=SC2086 # CURL_EXTRA : options volontairement découpées (répétition locale : -k).
    code="$(curl -sS --max-time 5 ${CURL_EXTRA:-} -o "$STATE_DIR/health.body" -w '%{http_code}' "$url" 2>/dev/null || true)"
    body="$(cat "$STATE_DIR/health.body" 2>/dev/null || true)"
    if [[ "$code" == 200 && ( -z "$expected" || "$body" == *"\"version\":\"${expected}\""* ) ]]; then
      return 0
    fi
    sleep 4
  done
  log "santé : dernier code HTTP « ${code:-aucun} » pour $url (version attendue $expected)"
  return 1
}
