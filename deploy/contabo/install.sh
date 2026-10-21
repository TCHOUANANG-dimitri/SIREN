#!/usr/bin/env bash
# Préparation d'un VPS Contabo neuf (Ubuntu 24.04 LTS) — à exécuter UNE fois, en root,
# APRÈS avoir déposé la clé SSH publique de l'exploitant (aucun mot de passe SSH).
#
#   sudo DEPLOY_PUBKEY="ssh-ed25519 AAAA… exploitant" bash install.sh
#
# Ce script n'a PAS été exécuté sur un serveur réel (aucun accès fourni) : le relire,
# puis l'exécuter depuis une console de secours Contabo ouverte en parallèle
# (une erreur de configuration SSH peut couper l'accès).
#
# Effets : utilisateur « deploy » (clé SSH seule, membre du groupe docker),
# SSH durci (pas de root, pas de mot de passe), pare-feu UFW (22, 80, 443),
# fail2ban, mises à jour de sécurité automatiques, Docker Engine + Compose (dépôt
# officiel), outils de sauvegarde (age, rclone), crontab des sauvegardes.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "à exécuter en root" >&2; exit 1; }
[[ -n "${DEPLOY_PUBKEY:-}" ]] || { echo "DEPLOY_PUBKEY requis (clé publique SSH de l'exploitant)" >&2; exit 1; }
. /etc/os-release
[[ "$ID" == ubuntu ]] || { echo "Ubuntu attendu (trouvé : $ID)" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades age rclone git

# Docker Engine (dépôt officiel Docker, signature vérifiée).
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Journaux Docker bornés. Attention : Docker publie ses ports en dehors d'UFW ; c'est
# pourquoi seul le proxy (80/443) publie des ports — base, Redis et API n'en publient aucun.
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" }, "live-restore": true }
JSON
systemctl restart docker

# Utilisateur d'exploitation.
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# Ajout sans écrasement : relancer le script ne retire pas la clé de déploiement GitHub.
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$DEPLOY_PUBKEY" /home/deploy/.ssh/authorized_keys || echo "$DEPLOY_PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
install -d -m 700 -o deploy -g deploy /var/backups/siren

# SSH : clé uniquement, pas de root.
cat > /etc/ssh/sshd_config.d/10-siren.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers deploy
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
CONF
sshd -t && systemctl reload ssh

# Pare-feu : seuls SSH, HTTP (redirection) et HTTPS. La base n'est jamais publiée.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

# Sauvegardes et test de restauration (le dépôt est cloné dans /home/deploy/siren).
cat > /etc/cron.d/siren-backup <<'CRON'
SHELL=/bin/bash
15 2 * * *  deploy /home/deploy/siren/deploy/contabo/backup.sh daily   >> /var/log/siren-backup.log 2>&1
30 2 * * 0  deploy /home/deploy/siren/deploy/contabo/backup.sh weekly  >> /var/log/siren-backup.log 2>&1
45 2 1 * *  deploy /home/deploy/siren/deploy/contabo/backup.sh monthly >> /var/log/siren-backup.log 2>&1
30 4 * * 1  deploy /home/deploy/siren/deploy/contabo/verify-restore.sh >> /var/log/siren-backup.log 2>&1
CRON
touch /var/log/siren-backup.log && chown deploy:deploy /var/log/siren-backup.log

echo "Préparation terminée. Étapes suivantes (en tant que deploy) : voir docs/DEPLOIEMENT_CONTABO.md §4."
