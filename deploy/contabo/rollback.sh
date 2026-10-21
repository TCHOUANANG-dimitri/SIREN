#!/usr/bin/env bash
# Retour à une version applicative antérieure (images uniquement, base inchangée).
#   deploy/contabo/rollback.sh            # version précédente enregistrée
#   deploy/contabo/rollback.sh v1.1.0     # version explicite
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_env_file
acquire_lock
TARGET="$(real_version "${1:-$(cat "$STATE_DIR/previous" 2>/dev/null || true)}")"
[[ -n "$TARGET" ]] || die "aucune version précédente enregistrée : préciser la version"
valid_version "$TARGET" || die "version invalide : $TARGET (attendu vX.Y.Z)"
log "retour arrière vers $TARGET"
# Inscrite dans .env.prod seulement si la version répond sainement (voir deploy.sh).
export SIREN_VERSION="$TARGET"
# Registre injoignable : les images de la version précédente sont normalement encore en cache local.
if [[ "${PULL:-1}" == 1 ]]; then
  compose pull --quiet api worker beat || log "téléchargement impossible : utilisation des images locales de $TARGET"
fi
compose up -d --remove-orphans || log "compose signale un échec au démarrage : contrôle de santé"
wait_healthy "${HEALTH_URL:-https://$(env_value DOMAIN)/health}" "$TARGET" || die "$TARGET ne répond pas sainement (.env.prod inchangé)"
set_version "$TARGET"
echo "$TARGET" > "$STATE_DIR/current"
log "OK : $TARGET rétablie"
