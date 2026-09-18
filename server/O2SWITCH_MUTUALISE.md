# Guide d'hébergement SIREN sur o2switch — Hébergement mutualisé

Ce guide décrit le déploiement du backend FastAPI SIREN sur l'hébergement
**mutualisé** o2switch (cPanel + CloudLinux + Phusion Passenger), sans VPS,
sans conteneur et sans accès root.

Les fichiers d'adaptation ajoutés au dépôt :

| Fichier | Rôle |
|---|---|
| `passenger_wsgi.py` | Pont WSGI (a2wsgi) utilisé par Passenger |
| `run_tasks.py` | Runner des tâches planifiées (cron, sans Celery worker) |
| `requirements-o2switch.txt` | Dépendances allégées pour mutualisé |

---

## 1. Pourquoi c'est faisable malgré les contraintes du mutualisé

| Contrainte o2switch | Contournement dans SIREN |
|---|---|
| Passenger ne parle que WSGI | `passenger_wsgi.py` + pont `a2wsgi` (`ASGIMiddleware`) |
| Pas d'événements de cycle de vie ASGI sous ce pont | `_boot()` appelé à l'import, jamais dans `lifespan`/`on_startup` (le lifespan d'`app.main` n'est de toute façon pas déclenché en WSGI) |
| Pas de processus persistant (ni Celery worker, ni beat) | Mode "cron" : `run_tasks.py retrain|purge` appelé par la crontab cPanel ; les fonctions `_retrain_all_children_async` / `_purge_async` sont appelées directement, sans Celery |
| Pas de Redis | `REDIS_ENABLED=false` ; les `publish_*` ne publient plus que sur le canal in-process (garde `settings.REDIS_ENABLED`) |
| Pas de PostgreSQL ni PostGIS | Base externe **Supabase** (Postgres + extension PostGIS, gratuite) |
| Pas de WebSocket via WSGI/Passenger | Endpoint `/api/v1/ws` inactif en mutualisé ; l'app mobile doit basculer en **polling REST** (`EXPO_PUBLIC_WS_URL` vide) |
| Calcul lourd bloquerait le worker Passenger | Le ML (scikit-learn) n'est importé qu'à la volée, exclusivement depuis `run_tasks.py` (cron) |

> Seules les dépendances mortes (`osmnx`, `networkx`, `pandas`, `shapely`) ont été
> retirées ; aucune réécriture du produit n'a été nécessaire.

---

## 2. Préparer Supabase (PostgreSQL + PostGIS)

1. Créer un projet sur [supabase.com](https://supabase.com) (gratuit).
2. Activer **PostGIS** : Dashboard → *Database* → *Extensions* → activer `postgis`.
3. Appliquer le schéma : *SQL Editor* → coller le contenu de `db_schema.sql` → *Run*.
4. Récupérer l'URL de connexion : *Project Settings* → *Database* →
   *Connection string* (URI). Utiliser le **pooler** (`host:6543`) pour mutualisé :
   ```
  
   ```
   En asyncpg (SSL requis) :
   ```
   postgresql+asyncpg://postgres.<ref>:<mdp>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
   DATABASE_URL_SYNC=postgresql://postgres.<ref>:<mdp>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
   ```

---

## 3. Déposer les sources sur l'hébergement

Le **Application Root** (dossier des sources) doit être séparé du dossier pointé
par le sous-domaine (recommandation o2switch : ne jamais mettre les sources dans
le docroot du domaine).

Depuis ta machine, via FTP/FTPS ou SSH, dépose le dossier `server/` du dépôt
dans, par exemple : `/home/<user>/siren-api` (rake racine de l'hébergement).

Note : le sous-domaine (ex. `api.sirenexample.com`) est déjà créé — il pointe
vers son propre dossier (`public_html` du sous-domaine) dans lequel l'outil
Python va générer le `.htaccess` de liaison. Il ne faut **pas** y placer les
sources.

---

## 4. Créer l'application Python (cPanel → Setup Python App)

1. cPanel → **Setup Python App** → *Create Application*.
2. Renseigner :
   - **Python version** : `3.11` (ou 3.12).
   - **Application root** : `/home/<user>/siren-api`.
   - **Application URL** : ton sous-domaine (ex. `api.sirenexample.com`).
   - **Application startup file** : `passenger_wsgi.py`.
   - **Application entry point** : `application`.
   - **Passenger log file** : `/home/<user>/logs/siren-api.log`.
3. *Create* → sur la page de gestion, récupérer la commande **Source** (elle
   permet d'entrer dans le venv en SSH/Terminal) et définir les **Add Variable**
   suivantes :
   ```
   ENVIRONMENT=production
   REDIS_ENABLED=false
   DOMAIN=api.sirenexample.com
   ALLOWED_ORIGINS=https://<ton-app-mobile>.com,http://localhost:8081
   DATABASE_URL=postgresql+asyncpg://...pooler.supabase.com:6543/postgres?sslmode=require
   DATABASE_URL_SYNC=postgresql://...pooler.supabase.com:6543/postgres?sslmode=require
   SECRET_KEY=<secrets générés : python3 -c "import secrets; print(secrets.token_hex(32))">
   JWT_SECRET_KEY=<idem>
   CADDY_EMAIL=admin@<ton-domaine>
   OSM_DATA_DIR=./data/osm
   ```
   (possibilité alternative : un fichier `.env` copié dans `siren-api/`.)
4. Installer les dépendances : dans *Configuration files*, renseigner
   `requirements-o2switch.txt` → *Run pip install* (ou en SSH :
   `source <commande fournie> && cd /home/<user>/siren-api && pip install -r requirements-o2switch.txt`).
5. Cliquer **Restart** sur l'application.

> Si `pip install` échoue avec des erreurs `gcc`/`make`/`ld` :
> `PassengerAppEnv development` + `PassengerFriendlyErrorPages on` dans le
> `.htaccess` du sous-domaine pour le debug, et contacter le support o2switch
> pour demander l'accès aux compilateurs.

---

## 5. Planifier les tâches (cron, remplace Celery)

cPanel → **Cron Jobs**. La commande utilise la commande `source` du venv fournie
par l'outil Python (adapter le chemin du venv et du dossier) :

```
# Réentraînement nocturne (ex-beat "retrain-all-children"), chaque jour à 03:00
0 3 * * * source /home/<user>/virtualenv/siren-api/3.11/bin/activate && cd /home/<user>/siren-api && python run_tasks.py retrain

# Purge des positions (ex-beat "purge-old-positions"), chaque dimanche à 04:00
0 4 * * 0 source /home/<user>/virtualenv/siren-api/3.11/bin/activate && cd /home/<user>/siren-api && python run_tasks.py purge
```

Les logs des runs sont écrits dans `siren-api/run_tasks.log` et l'email de sortie
du cron peut être activé depuis l'interface.

---

## 6. Vérifications et debug

```bash
curl -I https://api.sirenexample.com/health
# HTTP/2 200  {"status":"ok",...}

curl -X POST https://api.sirenexample.com/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'
```

En cas d'échec :
- Lire le **Passenger log file** défini au point 4.
- Activer le debug : dans le dossier du sous-domaine (docroot), éditer
  `.htaccess` et ajouter :
  ```
  PassengerAppEnv development
  PassengerFriendlyErrorPages on
  ```
  puis re-tester, et désactiver en prod.

---

## 7. Limitations à connaître

| Élément | État en mutualisé | Contournement |
|---|---|---|
| `/api/v1/ws` (WebSocket) | Inactif (WSGI/Passenger) | Polling REST côté app (`EXPO_PUBLIC_WS_URL` vide, `EXPO_PUBLIC_API_MODE=live`) |
| Celery worker/beat | Remplacé | `run_tasks.py` + crontab (section 5) |
| Redis pub/sub | Désactivé | In-process (`REDIS_ENABLED=false`) |
| Réentraînement ML lourd | Hors requête | Uniquement par cron, processus détaché |
| PostGIS | Externe | Supabase (extension `postgis`) |