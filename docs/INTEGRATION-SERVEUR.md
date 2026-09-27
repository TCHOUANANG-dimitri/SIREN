# Brancher l'application sur le serveur (local, staging, o2switch)

Les accès o2switch ne sont pas encore fournis : **aucune valeur réelle n'est dans
le dépôt**. L'application reste pleinement utilisable en mode `mock`.

## 1. Préparer le serveur

1. Appliquer le schéma (`server/db_schema.sql`) sur une base neuve, **ou** la
   migration `server/migrations/001_geofence_radius_and_device_defaults.sql`
   sur une base existante (non destructive, rollback en fin de fichier ;
   les sessions existantes devront se reconnecter une fois).
2. Renseigner `server/.env` à partir de `server/.env.example`. Hors
   `ENVIRONMENT=development`, le serveur **refuse de démarrer** si `SECRET_KEY`
   ou `JWT_SECRET_KEY` sont les valeurs d'exemple ou font moins de 32 caractères.
3. o2switch mutualisé : `REDIS_ENABLED=false` (voir `server/O2SWITCH_MUTUALISE.md`).
4. Push : déposer `firebase-credentials.json` (compte de service Firebase) hors Git,
   `FCM_CREDENTIALS_PATH` pointant dessus.
5. Vérifier : `GET https://<api>/health` → `{"status":"ok", …}`.

## 2. Construire l'application en mode live

`.env` à la racine du dépôt (jamais commité) :

```dotenv
EXPO_PUBLIC_APP_ENV=staging            # ou production
EXPO_PUBLIC_API_MODE=live
EXPO_PUBLIC_API_BASE_URL=https://<sous-domaine-api>
# o2switch mutualisé : pas de WebSocket → laisser vide (polling REST)
EXPO_PUBLIC_WS_URL=
```

Push Android : placer `google-services.json` (projet Firebase, package
`com.siren.app`) à la racine ou indiquer son chemin dans `GOOGLE_SERVICES_JSON`,
puis refaire le prebuild.

En mode live :
- le backend simulé n'est **pas** embarqué (`metro.config.js`) ;
- une configuration invalide (URL non HTTPS, mock en production…) affiche un écran
  explicite au lieu de planter ;
- l'écoute audio reste bloquée (`EXPO_PUBLIC_FEATURE_AUDIO`) tant que le cadre
  juridique n'est pas validé — et le serveur la refuse aussi (`AUDIO_ENABLED`).

## 3. Serveur local pour tester l'app

```bash
cd server && cp .env.example .env    # ENVIRONMENT=development, REDIS_ENABLED=false
uvicorn app.main:app --reload --host 0.0.0.0
```

Émulateur Android : `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000`,
`EXPO_PUBLIC_WS_URL=ws://10.0.2.2:8000/api/v1/ws` (le clair est toléré en local).

## 4. Tests

```bash
npm run lint && npm run typecheck && npm test          # application (Jest)
cd server && python -m pytest                          # serveur (sans base ni Redis)
```

Les tests serveur n'exigent ni PostgreSQL ni Redis ; les requêtes PostGIS
(distances, zones) ne sont pas couvertes et doivent être validées sur une base
réelle (staging).

## 5. Vérifications à faire sur staging avant les pilotes

- [ ] Inscription → session ouverte (OTP selon `OTP_MODE`), rafraîchissement après 30 min.
- [ ] Un deuxième compte **ne voit pas** l'enfant du premier (404) — y compris via `/ws`.
- [ ] Un secondaire « zone seule » ne reçoit aucune coordonnée (`/position` → 403).
- [ ] 4ᵉ invitation → 409.
- [ ] Télémétrie envoyée deux fois → un seul point ; point daté dans le futur → rejeté.
- [ ] Passage en urgence → notification FCM app fermée, tap → écran d'urgence.
- [ ] Coupure réseau → bandeau « Données hors-ligne — mise à jour à HH:MM », renommage d'un lieu rejoué au retour.
