# Guide d'hébergement SIREN sur o2switch — VPS Linux

## 1. Choix de l'offre

| Critère | Recommandation |
|---|---|
| **Offre** | VPS Linux (Ubuntu 24.04 LTS) |
| **RAM** | 4 Go minimum (8 Go recommandé) |
| **CPU** | 2 vCPU minimum |
| **Stockage** | 40 Go SSD |
| **IP** | Fixe, IPv4 |
| **Domaine** | Optionnel — acheter via o2switch ou registrar externe |

> L'offre « VPS Start » d'o2switch (4 Go RAM, 2 vCPU, ~10€/mois) suffit pour le pilote.

---

## 2. Prérequis sur le VPS

Connecte-toi en SSH :
```bash
ssh root@<IP_VPS>
```

### 2.1 Mise à jour du système
```bash
apt update && apt upgrade -y
```

### 2.2 Installation des paquets système
```bash
apt install -y curl wget git ufw \
  python3.12 python3.12-venv python3.12-dev python3-pip \
  postgresql-18 postgresql-18-postgis-3 \
  redis-server \
  docker.io docker-compose-v2 \
  certbot
```

### 2.3 Configuration du pare-feu (UFW)
```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## 3. Configuration de PostgreSQL

### 3.1 Démarrer et activer
```bash
systemctl start postgresql
systemctl enable postgresql
```

### 3.2 Créer l'utilisateur et la base
```bash
sudo -u postgres psql -c "CREATE USER siren WITH PASSWORD 'MOT_DE_PASSE_FORT';"
sudo -u postgres psql -c "CREATE DATABASE siren OWNER siren;"
sudo -u postgres psql -c "ALTER USER siren WITH SUPERUSER;"
```

### 3.3 Appliquer le schéma
```bash
# Copier le fichier sur le VPS d'abord (depuis ta machine locale)
scp /home/aurelien-parfait/Documents/github_reps/SIREN/server/db_schema.sql root@<IP_VPS>:/tmp/

# Puis sur le VPS :
sudo -u postgres psql -d siren -f /tmp/db_schema.sql
```

### 3.4 Vérifier
```bash
sudo -u postgres psql -d siren -c "\dt"
# Doit lister les 19 tables : users, refresh_tokens, devices, children, positions, places, etc.
```

---

## 4. Configuration de Redis

```bash
systemctl start redis-server
systemctl enable redis-server
redis-cli ping
# → PONG
```

### 4.1 Sécuriser Redis (optionnel mais recommandé)
```bash
nano /etc/redis/redis.conf
# Décommenter : requirepass MOT_DE_PASSE_REDIS
systemctl restart redis-server
```

---

## 5. Déploiement du code serveur

### 5.1 Cloner le dépôt
```bash
cd /opt
git clone https://github.com/<votre-user>/SIREN.git
cd SIREN/server
```

### 5.2 Environnement Python
```bash
python3.12 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 5.3 Fichier de configuration
```bash
cp .env.example .env
nano .env
```

Remplir les valeurs :
```env
ENVIRONMENT=production
SECRET_KEY=<generer avec: python3 -c "import secrets; print(secrets.token_hex(32))">
JWT_SECRET_KEY=<generer avec: python3 -c "import secrets; print(secrets.token_hex(32))">
DATABASE_URL=postgresql+asyncpg://siren:MOT_DE_PASSE_FORT@localhost:5432/siren
DATABASE_URL_SYNC=postgresql://siren:MOT_DE_PASSE_FORT@localhost:5432/siren
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
ALLOWED_ORIGINS=https://<votre-domaine>.com,http://localhost:8081
DOMAIN=<votre-domaine>.com
CADDY_EMAIL=admin@<votre-domaine>.com
```

### 5.4 Initialiser la base avec les données démo (optionnel)
```bash
python3 -c "
import asyncio
from app.core.database import init_db
asyncio.run(init_db())
print('Tables créées via SQLAlchemy')
"
```

---

## 6. Services systemd (recommandé pour la production)

Crée les fichiers de service pour que l'API, Celery worker et Celery beat démarrent automatiquement.

### 6.1 Service API FastAPI
```bash
nano /etc/systemd/system/siren-api.service
```

```ini
[Unit]
Description=SIREN FastAPI Server
After=network.target postgresql.service redis.service

[Service]
User=root
WorkingDirectory=/opt/SIREN/server
ExecStart=/opt/SIREN/server/venv/bin/gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --workers 4 \
  --max-requests 10000 \
  --timeout 120
Restart=always
RestartSec=5
Environment="PATH=/opt/SIREN/server/venv/bin"
EnvironmentFile=/opt/SIREN/server/.env

[Install]
WantedBy=multi-user.target
```

### 6.2 Service Celery Worker
```bash
nano /etc/systemd/system/siren-worker.service
```

```ini
[Unit]
Description=SIREN Celery Worker
After=network.target siren-api.service redis.service postgresql.service

[Service]
User=root
WorkingDirectory=/opt/SIREN/server
ExecStart=/opt/SIREN/server/venv/bin/celery \
  -A app.tasks.celery_app worker \
  --loglevel=info \
  --concurrency=2 \
  --queues=celery,ml,maintenance
Restart=always
RestartSec=10
Environment="PATH=/opt/SIREN/server/venv/bin"
EnvironmentFile=/opt/SIREN/server/.env

[Install]
WantedBy=multi-user.target
```

### 6.3 Service Celery Beat
```bash
nano /etc/systemd/system/siren-beat.service
```

```ini
[Unit]
Description=SIREN Celery Beat Scheduler
After=network.target siren-api.service redis.service postgresql.service

[Service]
User=root
WorkingDirectory=/opt/SIREN/server
ExecStart=/opt/SIREN/server/venv/bin/celery \
  -A app.tasks.celery_app beat \
  --loglevel=info
Restart=always
RestartSec=10
Environment="PATH=/opt/SIREN/server/venv/bin"
EnvironmentFile=/opt/SIREN/server/.env

[Install]
WantedBy=multi-user.target
```

### 6.4 Activer et démarrer
```bash
systemctl daemon-reload
systemctl enable siren-api siren-worker siren-beat
systemctl start siren-api siren-worker siren-beat

# Vérifier
systemctl status siren-api
systemctl status siren-worker
systemctl status siren-beat
```

---

## 7. Reverse proxy avec Caddy (HTTPS automatique)

### 7.1 Installer Caddy
```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy
```

### 7.2 Configurer Caddy
```bash
nano /etc/caddy/Caddyfile
```

```caddyfile
<your-domain>.com {
    tls <your-email>@example.com

    # API FastAPI
    handle /api/* {
        reverse_proxy localhost:8000 {
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    # Health check
    handle /health {
        reverse_proxy localhost:8000
    }

    # WebSocket
    handle /api/v1/ws {
        reverse_proxy localhost:8000 {
            header_up Connection {>Connection}
            header_up Upgrade {>Upgrade}
        }
    }

    # Swagger docs (développement uniquement — retirer en prod)
    handle /docs {
        reverse_proxy localhost:8000
    }
    handle /openapi.json {
        reverse_proxy localhost:8000
    }

    # Sécurité
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        X-XSS-Protection "1; mode=block"
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

### 7.3 Redémarrer Caddy
```bash
systemctl restart caddy
systemctl enable caddy
```

### 7.4 Vérifier le certificat TLS
```bash
curl -I https://<your-domain>.com/health
# Doit renvoyer HTTP/2 200 avec headers SSL
```

---

## 8. Sauvegardes automatiques

### 8.1 Script de dump PostgreSQL
```bash
nano /opt/SIREN/scripts/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/SIREN/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

sudo -u postgres pg_dump siren | gzip > "$BACKUP_DIR/siren_${DATE}.sql.gz"

# Garder les 30 dernières sauvegardes
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

```bash
chmod +x /opt/SIREN/scripts/backup.sh
```

### 8.2 Cron quotidien
```bash
crontab -e
```

```cron
0 2 * * * /opt/SIREN/scripts/backup.sh >> /opt/SIREN/backups/backup.log 2>&1
```

---

## 9. Monitoring et supervision

### 9.1 Health check
```bash
curl https://<your-domain>.com/health
```

### 9.2 Logs
```bash
# API
journalctl -u siren-api -f

# Worker
journalctl -u siren-worker -f

# Beat
journalctl -u siren-beat -f

# PostgreSQL
tail -f /var/log/postgresql/postgresql-18-main.log

# Redis
tail -f /var/log/redis/redis-server.log

# Caddy
journalctl -u caddy -f
```

### 9.3 Sentry (optionnel — erreurs en temps réel)
Ajouter dans `.env` :
```env
SENTRY_DSN=https://<cle-sentry>@sentry.io/<projet>
```

---

## 10. Connexion depuis l'application mobile

Dans le `.env` de l'app React Native (racine du projet SIREN) :
```env
EXPO_PUBLIC_API_MODE=live
EXPO_PUBLIC_API_BASE_URL=https://<your-domain>.com
EXPO_PUBLIC_WS_URL=wss://<your-domain>.com/api/v1/ws
```

---

## 11. Maintenance

### 11.1 Mises à jour
```bash
cd /opt/SIREN
git pull
source server/venv/bin/activate
pip install -r server/requirements.txt

# Migrer la base (si changements de schéma)
# alembic upgrade head

systemctl restart siren-api siren-worker siren-beat
```

### 11.2 Purge des positions (automatique via Celery beat)
La tâche `purge_old_positions` tourne chaque dimanche à 04:00 UTC. Elle supprime les positions de plus de 90 jours (configurable via `POSITION_RETENTION_DAYS`).

### 11.3 Espace disque
```bash
# Vérifier
df -h

# Nettoyer les logs
journalctl --vacuum-size=500M

# Nettoyer Docker (si utilisé)
docker system prune -f
```

---

## 12. Coûts estimés (o2switch)

| Poste | Coût mensuel |
|---|---|
| VPS Start (4 Go RAM, 2 vCPU) | ~10€ |
| Domaine (.com) | ~1€/mois (annualisé) |
| TLS (Caddy/Let's Encrypt) | Gratuit |
| Push (FCM) | Gratuit |
| Sauvegarde (stockage local) | Inclus |
| **Total** | **~11€/mois** |

---

## 13. Checklist de déploiement

- [ ] VPS provisionné (Ubuntu 24.04)
- [ ] Paquets installés (Python 3.12, PostgreSQL 18, Redis, Docker, Caddy)
- [ ] UFW configuré (80, 443, SSH)
- [ ] PostgreSQL configuré (utilisateur `siren`, base `siren`)
- [ ] Schéma appliqué (`db_schema.sql` → 19 tables, 6 vues, 6 triggers)
- [ ] Redis fonctionnel (`PING` → `PONG`)
- [ ] Code déployé dans `/opt/SIREN`
- [ ] `.env` configuré (secrets générés)
- [ ] pip install terminé (28 dépendances)
- [ ] Services systemd créés et démarrés (api, worker, beat)
- [ ] Caddy configuré (HTTPS, reverse proxy)
- [ ] Certificat TLS valide
- [ ] `curl /health` → `200 OK`
- [ ] `curl /docs` → Swagger accessible
- [ ] Sauvegardes planifiées (cron)
- [ ] App mobile connectée (`EXPO_PUBLIC_API_MODE=live`)
