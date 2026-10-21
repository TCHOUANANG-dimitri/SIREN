# Architecture technique — SIREN

Reflète le code au 2026-10-21. Décisions et justifications : `docs/DECISIONS_TECHNIQUES.md`. Contrat d'API : `docs/contrats/api-app-serveur-v1.md`. Schéma : `data/SCHEMA.md`.

## 1. Vue d'ensemble

```
 Traceur ESP32 + A9G ──MQTT (T-DEV-MQTT)──┐
        │  HTTP de secours                │
        └──POST /device/v1/frame──────────┤
                                          ▼
 App mobile (Expo) ──HTTPS /api/v1──▶ API FastAPI ──▶ PostgreSQL/PostGIS
        │  ▲  WebSocket /ws (ou polling)     │  ▲          (positions partitionnées par mois)
        │  └─────────────────────────────────┘  └── Redis (pub/sub temps réel, broker Celery)
        │                                                  ▲
        └─ file locale de trames ─POST /device/v1/relay──▶ │   worker + beat Celery (tâches planifiées)
           (T-BLE-01 : transport local non spécifié)       │
 Fournisseurs sortants : SMS (Twilio | Africa's Talking), WhatsApp Cloud API, SMTP, Expo push
```

Le téléphone ne parle jamais directement au traceur dans le protocole de référence ; le relais par téléphone est une capacité serveur + logique app, son transport est bloqué (D-09).

## 2. Application mobile (`src/`)

| Couche | Rôle | Fichiers |
|---|---|---|
| Écrans | Expo Router : `(auth)`, `(main)`, `(emergency)` | `src/app/` |
| Accès aux données | `api` unique (mock ou live), contrats zod, client HTTP (rafraîchissement unique, erreurs structurées) | `src/api/` |
| Authentification | inscription téléphone obligatoire, connexion par identifiant, OTP 6 caractères multi-canal, 2FA par jeton MFA, mot de passe oublié, changement de numéro, garde « téléphone à compléter » | `src/app/(auth)/*`, `src/api/hooks/useAuth.ts`, `src/stores/pendingAuthStore.ts`, `src/features/auth/{phone,otpCode,ChannelPicker}.ts*`, `src/app/(main)/settings/phone.tsx` |
| Appairage | numéro exact sensible à la casse, QR = donnée, saisie formatée, PIN, dissociation / ré-association | `src/features/pairing/serial.ts`, `src/components/SerialInput.tsx`, `src/app/(main)/add-child.tsx`, `src/features/children/tabs/DeviceTab.tsx` |
| Urgence | barre d'appels fixe, raisons traduites, carte non interactive | `src/app/(emergency)/urgence.tsx` |
| Carte | dispositif (actuelle / dernière connue), téléphone (après autorisation), états d'autorisation | `src/features/children/tabs/MapTab.tsx`, `src/features/tracking/{phoneLocation,PhoneLocationControl}.ts*`, `src/stores/locationStore.ts` |
| Relais | machine d'états, file persistante, session, simulateur | `src/features/deviceLink/` |

Règles : aucun texte en dur (i18n FR/EN), thème par `makeStyles`, jetons dans `expo-secure-store`, mock jamais embarqué en live (`metro.config.js`).

## 3. Serveur (`server/app/`)

| Module | Rôle |
|---|---|
| `api/v1/endpoints/auth.py` | inscription, connexion (identifiant, limites compte/IP, temps constant), 2FA (`/2fa/send`, `/2fa/verify`), `/otp/channels`, vérification du téléphone, mot de passe oublié uniforme |
| `api/v1/endpoints/users.py` | profil (sans téléphone), mot de passe, 2FA, **changement de numéro** (`/me/phone`, `/me/phone/confirm`), suppression du compte |
| `api/v1/endpoints/children.py` | enfants, appairage strict + PIN, `PUT/DELETE /{id}/device`, recherche limitée |
| `api/v1/endpoints/device_ingestion.py` | télémétrie JSON, trame « ; » HTTP, relais par téléphone, accusés signés ; cœur commun `ingest_points` (dédoublonnage ± 2 s, verrou consultatif, score, alertes) |
| `api/v1/endpoints/device_commands.py`, `services/device_commands.py` | commandes LOCALISER / MODE / REDEMARRER, cycle et expiration |
| `services/device_protocol.py` | analyse et validation des trames, codes d'événement, HMAC (pur, testé seul) |
| `services/otp.py`, `services/otp_delivery.py` | cycle OTP et adaptateurs de livraison |
| `services/rate_limit.py` | limitation de débit en base, IP client derrière mandataire |
| `core/phone.py`, `core/serial.py` | normalisation E.164, numéro de série |
| `core/security_headers.py` | CSP, HSTS (hors dev), `no-store`, anti-cadrage |
| `core/authz.py` | droits principal / secondaire par enfant |
| `tasks/` + `run_tasks.py` | Celery beat (ou cron o2switch) : partitions, purges, réentraînement, expiration des commandes, purge des compteurs |

Erreurs métier : `{"detail": {"code", "message", "params"}}` ; l'app affiche `apiErrors.reasons.<code>`.

## 4. Données

- Migrations `server/migrations/00N_*.sql` appliquées par `apply.py` (empreintes SHA-256) ; `data/schema.sql` régénéré par `scripts/db/rebuild-schema.sh` et vérifié en CI.
- 004 : téléphone (trigger, E.164, unicité), OTP multi-canal (canal, empreintes de destination/IP, valeur en attente, usages), `rate_limit_events`, PIN, format du numéro de série, `device_commands`, `device_relay_events`, partition `SECURITY DEFINER`.
- 005 : `positions.source` (`device` | `relay` | `sms`).
- Classification et rétention : §6.

## 5. Flux clés

**Inscription :** `POST /auth/register` (téléphone normalisé, e-mail facultatif) → `GET /auth/otp/channels` → `POST /auth/request-otp {channel}` → `POST /auth/verify-otp` → session (sinon session ouverte avec numéro « non vérifié » si aucun canal n'existe — jamais prétendu vérifié).

**Connexion 2FA :** `POST /auth/login` → `{twofaRequired, mfaToken (5 min, inutilisable comme session), channels}` → `POST /auth/2fa/send {mfaToken, channel}` (renvoi = invalidation) → `POST /auth/2fa/verify` → jetons.

**Changement de numéro :** mot de passe → code au nouveau numéro → confirmation verrouillée → index unique → avis à l'ancien numéro.

**Trame relayée :** app (`DeviceLinkSession` → `Outbox`) → `POST /device/v1/relay` (lots ≤ 100) → droits sur l'enfant → empreinte unique → `ingest_points(source='relay')` → WebSocket aux seuls comptes autorisés.

## 6. Classification et rétention des données

| Donnée | Classe | Stockage | Rétention / effacement |
|---|---|---|---|
| Positions de l'enfant, trames | **Sensible** (localisation d'un mineur) | `positions` (partitions), file locale app (≤ 72 h) | `POSITION_RETENTION_DAYS` (90 j par défaut), purge hebdomadaire ; file effacée à la déconnexion |
| Téléphone, e-mail, nom | Personnelle | `users` | suppression du compte (désactivation immédiate ; purge physique À VALIDER) |
| Mots de passe, PIN | Secret | hachés bcrypt | — |
| Codes OTP, jetons de challenge | Secret éphémère | HMAC seulement | expirent en 10 min ; lignes conservées pour l'audit des limites |
| Clés de limitation (IP, identifiant) | Personnelle pseudonymisée | HMAC dans `rate_limit_events` | purge > 48 h |
| Journaux | Technique | conteneurs (3 × 10 Mo) | rotation ; aucun code, destination masquée, coordonnées masquées côté app |
| Sauvegardes | Contient tout ce qui précède | `BACKUP_DIR` (600), chiffrables `age` | 7 j / 4 sem. / 6 mois / 5 pré-déploiement |

## 7. Sécurité (résumé)

TLS (Caddy, HSTS), CORS restreint (méthodes et en-têtes listés, pas de `*` hors dev), en-têtes de sécurité, documentation de l'API fermée hors développement, validation pydantic (`extra="forbid"` sur les mises à jour sensibles), autorisation par enfant, limitation de débit, refus de démarrer avec des secrets d'exemple ou sans mode OTP explicite, base sans accès Internet et rôle sans DDL, mot de passe du propriétaire de la base absent des conteneurs applicatifs, `X-Forwarded-For` ignoré sauf mandataire déclaré, jeton WebSocket retiré des journaux, contrôle de disponibilité `/health/ready`, audits de dépendances et gitleaks en CI. Revue indépendante du 2026-10-21 : `docs/PLAN_TESTS_SECURITE.md` §5. Détails et tests : `docs/PLAN_TESTS_SECURITE.md`.
