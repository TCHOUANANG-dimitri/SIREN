# SIREN — Serveur / Backend

## Pile technique

| Domaine | Choix |
|---|---|
| Langage | Python 3.12 |
| Framework API | FastAPI |
| Serveur ASGI | Uvicorn + Gunicorn |
| Base de données | PostgreSQL 15+ / PostGIS (image `postgis/postgis:15-3.4`) |
| Cache & file | Redis |
| Tâches asynchrones | Celery (worker + beat) |
| Temps réel | WebSocket + Redis pub/sub |
| ORM | SQLAlchemy 2.0 + Alembic |
| Validation | Pydantic v2 |
| IA / ML | scikit-learn, numpy, pandas |
| Géospatial | osmnx, networkx, shapely |
| Push | Firebase Cloud Messaging |
| TLS | Caddy (HTTPS automatique) |

---

## Déploiement rapide

```bash
cd server
cp .env.example .env
# Éditer .env :
#  - Docker : remplacer localhost par db (DATABASE_URL, DATABASE_URL_SYNC)
#    et redis (REDIS_URL, CELERY_BROKER_URL, CELERY_RESULT_BACKEND),
#    puis ajuster DOMAIN et les secrets.
#  - Manuel : conserver localhost.

# Option A — Docker (production : code embarqué dans l'image)
docker compose up -d --build
curl http://localhost:8000/health

# Option A' — Docker (développement : code source monté, reload automatique)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Option B — Manuel
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API : `http://localhost:8000` | Swagger : `http://localhost:8000/docs`

### Conteneurs (docker compose)

| Service | Rôle |
|---|---|
| `migration` | `alembic upgrade head` — une passe unique qui verrouille le démarrage de `api` |
| `api` | FastAPI (gunicorn + uvicorn), `/health` surveillé par healthcheck |
| `worker` | Celery (files `celery`, `ml`, `maintenance`) |
| `beat` | Planificateur Celery, planning dans le volume `beat_data` |
| `db` | PostgreSQL 15 + PostGIS, schéma appliqué au 1er démarrage via `db_schema.sql` |
| `redis` | Broker/result backend (persistance AOF) |
| `proxy` | Caddy : TLS auto, `/api/*`, `/health` et Swagger -> `api:8000` |

```bash
docker compose ps                  # état + healthchecks
docker compose logs -f api         # journaux (rotation 10 Mo x 3)
docker compose down                # arrêt, les volumes (données) persistent
docker compose down -v             # purge complète (db, redis, osm, caddy, beat)

SIREN_API_PORT=8001 docker compose up -d   # port 8000 déjà pris ailleurs
```

Seuls `api` (8000, surchargeable avec `SIREN_API_PORT`) et `proxy` (80/443)
sont accessibles depuis l'extérieur ; `db` (5432) et `redis` (6379) ne sont
publiés que sur `127.0.0.1`.

---

## Structure du projet

```
server/
├── app/
│   ├── main.py                          # Point d'entrée FastAPI
│   ├── core/
│   │   ├── config.py                    # Configuration (pydantic-settings)
│   │   ├── security.py                  # JWT, bcrypt, tokens
│   │   ├── database.py                  # SQLAlchemy async engine
│   │   ├── dependencies.py              # Dépendances FastAPI (get_current_user)
│   │   └── serialization.py             # snake_case → camelCase
│   ├── models/                          # 19 modèles SQLAlchemy
│   ├── schemas/                         # Pydantic schemas (validation)
│   ├── api/v1/endpoints/                # 17 fichiers de routes
│   │   ├── auth.py                      # register, login, refresh, forgot, logout, otp
│   │   ├── users.py                     # get/patch profile, delete account, push token
│   │   ├── children.py                  # CRUD enfants, status, find device
│   │   ├── tracking.py                  # position, history, zone-state, fix GPS
│   │   ├── places.py                    # CRUD lieux
│   │   ├── geofences.py                 # CRUD périmètres
│   │   ├── risk.py                      # score risque, historique
│   │   ├── alerts.py                    # liste alertes (par enfant + globales)
│   │   ├── sharing.py                   # RBAC, permissions, audit
│   │   ├── community.py                 # signalements communautaires
│   │   ├── search_zone.py               # heatmap, disparition
│   │   ├── emergency_contacts.py        # contacts d'urgence
│   │   ├── audio.py                     # activation audio
│   │   ├── device_ingestion.py          # télémétrie IoT (clé dispositif)
│   │   ├── device_settings.py           # settings dispositif
│   │   └── websocket.py                 # temps réel
│   ├── crud/                            # 17 fichiers CRUD
│   ├── services/
│   │   ├── fusion_score.py              # Moteur de fusion (CDC 5.4)
│   │   ├── scoring.py                   # Scoring temps réel
│   │   ├── push.py                      # FCM / APNs
│   │   └── websocket_manager.py         # Redis pub/sub + WS
│   └── tasks/
│       ├── celery_app.py                # Configuration Celery
│       └── retrain.py                   # Réentraînement nocturne
├── db_schema.sql                        # Schéma complet (19 tables, 6 vues, 6 triggers)
├── Dockerfile                           # Image API (python:3.12-slim, utilisateur non-root)
├── Dockerfile.worker                    # Image worker/beat Celery
├── .dockerignore                        # .env et artefacts exclus de l'image
├── docker-compose.yml                   # prod : api, worker, beat, db, redis, proxy
├── docker-compose.dev.yml               # dev : code monté, reload automatique
├── Caddyfile                            # Reverse proxy TLS
├── requirements.txt                     # Dépendances Python (pinnées)
├── HOSTING_O2SWITCH.md                  # Guide hébergement o2switch
└── README.md                            # Ce fichier
```

---

## Sécurité et contrat (à lire avant de modifier une route)

- Toute route liée à un enfant passe par `app/core/authz.get_child_access` (404 pour un tiers,
  droits du secondaire, `require_principal`). Plafond : 3 proches non révoqués par enfant.
- Contrat de référence : [`docs/contrats/api-app-serveur-v1.md`](../docs/contrats/api-app-serveur-v1.md)
  (dates ISO UTC avec fuseau, km/h, mètres, scores 0–100, jours 0 = dimanche, horaires en heure locale).
- Hors `ENVIRONMENT=development`, le serveur refuse de démarrer avec les secrets d'exemple.
- Base existante : appliquer `migrations/001_geofence_radius_and_device_defaults.sql`.

## Tests

```bash
python3.12 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt   # ou le sous-ensemble : fastapi sqlalchemy pydantic pydantic-settings email-validator "python-jose[cryptography]" passlib bcrypt==4.0.1 geoalchemy2 asyncpg redis httpx pytest pytest-asyncio
python -m pytest
```

Les tests n'exigent ni PostgreSQL ni Redis. Un `xfail` documente l'écart d'hystérésis (IA-07).

## API — Tous les endpoints

### Authentification
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Création de compte |
| POST | `/api/v1/auth/login` | Connexion |
| POST | `/api/v1/auth/refresh` | Rafraîchir token |
| POST | `/api/v1/auth/forgot` | Mot de passe oublié |
| POST | `/api/v1/auth/logout` | Déconnexion |
| POST | `/api/v1/auth/request-otp` | Demander code OTP |
| POST | `/api/v1/auth/verify-otp` | Vérifier code OTP |

### Utilisateurs
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/users/me` | Profil utilisateur |
| PATCH | `/api/v1/users/me` | Modifier profil |
| DELETE | `/api/v1/users/me` | Supprimer compte |
| POST | `/api/v1/users/me/push-token` | Enregistrer push token |

### Enfants
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/children` | Liste des enfants |
| POST | `/api/v1/children` | Ajouter un enfant |
| GET | `/api/v1/children/{id}` | Détail enfant |
| PATCH | `/api/v1/children/{id}` | Modifier enfant |
| GET | `/api/v1/children/{id}/status` | Statut dispositif |
| GET | `/api/v1/children/devices/{id}` | Trouver dispositif |

### Tracking
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/children/{id}/position` | Dernière position |
| POST | `/api/v1/children/{id}/position/fix` | Demander fix GPS |
| GET | `/api/v1/children/{id}/zone-state` | État zone sûre |
| GET | `/api/v1/children/{id}/history` | Historique positions |

### Lieux
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/children/{id}/places` | Lieux connus |
| POST | `/api/v1/children/{id}/places` | Déclarer un lieu |
| PATCH | `/api/v1/places/{id}` | Modifier un lieu |

### Périmètres
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/children/{id}/geofences` | Périmètres |
| POST | `/api/v1/children/{id}/geofences` | Créer un périmètre |
| PATCH | `/api/v1/geofences/{id}` | Modifier |
| DELETE | `/api/v1/geofences/{id}` | Supprimer |

### Risque & Alertes
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/children/{id}/risk` | Score de risque |
| GET | `/api/v1/children/{id}/risk/history` | Historique risque (24h) |
| GET | `/api/v1/children/{id}/alerts` | Alertes par enfant |
| GET | `/api/v1/children/alerts` | Toutes les alertes |
| PATCH | `/api/v1/children/alerts/{id}` | Traiter une alerte |

### Partage (RBAC)
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/children/{id}/shares` | Partages |
| POST | `/api/v1/children/{id}/shares` | Inviter |
| GET | `/api/v1/children/shares/{id}` | Détail partage |
| PATCH | `/api/v1/children/shares/{id}` | Modifier |
| GET | `/api/v1/children/{id}/permissions` | Mes permissions |
| GET | `/api/v1/children/{id}/shares/audit` | Journal d'accès |

### Recherche & Urgence
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/children/{id}/search-zone` | Zone de recherche |
| POST | `/api/v1/children/{id}/disappearance` | Signaler disparition |
| GET | `/api/v1/children/{id}/emergency-contacts` | Contacts urgences |
| POST | `/api/v1/children/{id}/emergency-contacts` | Ajouter contact |

### Audio
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/v1/children/{id}/audio/activate` | Activer audio |
| GET | `/api/v1/children/{id}/audio/logs` | Historique audio |

### Communauté
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/community/reports` | Signalements |
| POST | `/api/v1/community/reports` | Signaler |

### Dispositif IoT (auth par clé)
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/v1/device/v1/telemetry` | Télémétrie batch |
| GET | `/api/v1/device/v1/pack` | Télécharger pack params |
| POST | `/api/v1/device/v1/event` | Événement dispositif |

### Temps réel
| Protocole | Route | Description |
|---|---|---|
| WebSocket | `/api/v1/ws?token=&childId=` | Positions live, alertes, scores |

---

## Moteur de risque (fusion)

```
score = (w_univ·s_univ + w_decl·s_decl + w_geo·s_geo_eff + w_mouv·s_mouv)
w_univ=0.35, w_decl=0.30, w_geo=0.20, w_mouv=0.15
s_geo_eff = s_geo × confiance_modèle

Seuils : 0-29 veille | 30-69 pré-alerte | 70-100 urgence
Bonus concordance : +25% si ≥ 2 signaux ≥ 0.6
Bonus contexte : +15% si nuit ou hors périmètre
Hystérésis : 2 mesures consécutives avant déclenchement
```

---

## Hébergement

Voir `HOSTING_O2SWITCH.md` pour le guide complet de déploiement sur o2switch.
