# SIREN — Serveur / Backend

## Pile technique

| Domaine | Choix |
|---|---|
| Langage | Python 3.12 |
| Framework API | FastAPI |
| Serveur ASGI | Uvicorn + Gunicorn |
| Base de données | PostgreSQL 18 / PostGIS |
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
# Éditer .env

# Option A — Docker
docker compose up -d

# Option B — Manuel
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API : `http://localhost:8000` | Swagger : `http://localhost:8000/docs`

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
├── docker-compose.yml                   # api, worker, beat, db, redis, proxy
├── Caddyfile                            # Reverse proxy TLS
├── requirements.txt                     # 28 dépendances
├── HOSTING_O2SWITCH.md                  # Guide hébergement o2switch
└── README.md                            # Ce fichier
```

---

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
