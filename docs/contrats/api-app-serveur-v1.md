# Contrat API application ↔ serveur — v1

> Source de vérité : routes FastAPI de `server/app/api/v1` et schémas de validation
> côté app `src/api/contracts/index.ts`. Toute évolution cassante passe par une v2
> (préfixe `/api/v2`) ; la v1 reste servie tant qu'une version de l'app l'utilise.

## Conventions

| Sujet | Règle |
|---|---|
| Transport | HTTPS obligatoire hors poste local ; WSS pour le temps réel (voir « Temps réel »). |
| Préfixe | `/api/v1` |
| Authentification | `Authorization: Bearer <accessToken>` (JWT, 30 min). Refresh token opaque (JWT `type=refresh`, 30 j) stocké côté serveur sous forme d'empreinte SHA-256. |
| Rotation | `POST /auth/refresh` révoque l'ancien refresh token et renvoie `{accessToken, refreshToken}`. |
| Clés JSON | camelCase dans toutes les réponses. |
| Dates | ISO 8601 **avec fuseau**, stockées en UTC. Un horodatage sans fuseau est refusé (422). |
| Coordonnées | WGS84 degrés décimaux, `lat` ∈ [-90, 90], `lon` ∈ [-180, 180]. |
| Unités | vitesse **km/h** (`speedKmh`), précision **mètres** (`accuracyM`), rayon **mètres** (`radiusM`), batterie **%** (0–100), scores **0–100**, confiance **0–100**. |
| Jours | `jours` : 0 = dimanche … 6 = samedi. Horaires `HH:mm` en **heure locale** (`DEFAULT_TIMEZONE`, Africa/Douala). |
| Écritures | Chaque POST/PATCH/DELETE porte un en-tête `Idempotency-Key` (généré par l'app). Le serveur ne l'exploite pas encore ; les routes sensibles sont rendues idempotentes par construction (voir tableau). |
| Erreurs | `{ "detail": "…" }` + code HTTP. L'app n'affiche jamais `detail` : elle traduit le code (voir `apiErrors.*`). |

## Autorisation (RBAC)

Toute route sous `/children/{childId}` passe par `app/core/authz.get_child_access` :

- parent propriétaire → tous les droits ;
- secondaire au statut `actif` → uniquement ses droits (`position_precise`, `etat_zone`,
  `alertes_prealerte`, `alertes_urgence`, `historique`, `mobilisation`) ;
- toute autre personne → **404** (l'existence de l'enfant n'est pas révélée).

Maximum **3** accès non révoqués (invités + actifs) par enfant (409 au-delà).

## Routes

| Méthode et chemin | Droit requis | Réponse | Notes |
|---|---|---|---|
| `POST /auth/register` | — | `{user, accessToken, refreshToken}` | Mot de passe ≥ 10 car., minuscule, majuscule, chiffre, symbole (422 sinon). |
| `POST /auth/login` | — | `{user, accessToken, refreshToken, twofaRequired}` | 2FA : flux « jeton temporaire » à spécifier. |
| `POST /auth/refresh` | — | `{accessToken, refreshToken}` | Rotation. |
| `POST /auth/logout` | — | 204 | Révoque le refresh token. |
| `POST /auth/request-otp` | — | `{required, sent, devHint?}` | `required=false` : l'app saute l'écran OTP (voir `OTP_MODE`). |
| `POST /auth/verify-otp` | — | `{verified}` | Code de dev accepté seulement si `ENVIRONMENT=development`. |
| `POST /auth/forgot` | — | `{sent: true}` | **Aucun email envoyé** (fournisseur non branché). |
| `GET/PATCH /users/me` | session | `User` | `langue` ∈ `fr|en`. |
| `DELETE /users/me` | session | 204 | Révoque sessions et jetons push, désactive les enfants, révoque les partages. |
| `POST /users/me/push-token` | session | 204 | `{token, platform: fcm|apns}` (jeton natif, pas Expo Push). |
| `GET /children` | session | `Child[]` | |
| `POST /children` | parent | `Child` | Appairage par identifiant seul : **voir contrat dispositif**. |
| `GET /children/devices/{deviceId}` | session | `{deviceId, online, battery, configVersion, firmwareVersion}` | 404 aussi si déjà associé ailleurs. |
| `GET/PATCH /children/{id}` | accès / parent | `Child` | `sleepSchedule: {jours, heureDebut, heureFin}`. |
| `GET /children/{id}/status` | accès | `DeviceStatus` | `energyMode` ∈ `continu|equilibre|economie`, `sensitivity` texte `"0".."100"`. |
| `GET /children/{id}/position` | `position_precise` | `Position` ou **204** | Clé d'horodatage : `ts`. |
| `POST /children/{id}/position/fix` | `position_precise` | 202 `{accepted, delivered:false}` | Canal descendant vers le boîtier non défini. |
| `GET /children/{id}/zone-state` | `etat_zone` ou `position_precise` | `{inSafeZone, inZone, zoneName, asOf}` | **Aucune coordonnée**. |
| `GET /children/{id}/history?from&to` | `historique` | `Position[]` (récent → ancien, 500 max) | L'app retrie chronologiquement. |
| `GET/POST /children/{id}/places` | lecture : zone/position ; écriture : parent | `Place` | Un créneau par lieu à la création. |
| `PATCH /children/places/{placeId}` | parent | `Place` | |
| `GET/POST /children/{id}/geofences` | idem | `Geofence` (cercle : centre + `radiusM`) | Polygone : non exposé en v1. |
| `PATCH/DELETE /children/geofences/{id}` | parent | `Geofence` / 204 | |
| `GET /children/{id}/risk` | accès | `RiskScore` (`timestamp` nul si jamais calculé) | |
| `GET /children/{id}/risk/history` | accès | `{scores: RiskScore[]}` (24 h) | |
| `GET /children/{id}/risk/config` | accès | `{thresholds: {prealerte, urgence}}` | Nouvelle route : seuils servis par le serveur. |
| `GET /children/alerts` | session | `Alert[]` visibles | Déclarée avant `/{id}` (sinon capturée). |
| `GET /children/{id}/alerts` | `alertes_*` | `Alert[]` | Filtré par niveau selon les droits. |
| `PATCH /children/alerts/{id}` | parent | `Alert` | `status` ∈ `acquittee|fausse|resolue` ; idempotent ; pas de retour à `active`. |
| `GET/POST /children/{id}/shares` | parent | `SecondaryAccess` | Invité retrouvé par email **ou** téléphone ; doit avoir un compte. |
| `GET/PATCH /children/shares/{id}` | parent ou invité | `SecondaryAccess` | L'invité peut accepter / se retirer, pas changer ses droits. |
| `GET /children/{id}/permissions` | accès | `Permission[]` | |
| `GET /children/{id}/shares/audit` | parent | `AccessAuditEntry[]` | Alimenté par chaque lecture d'un secondaire. |
| `GET /children/{id}/search-zone` | `mobilisation` ou `position_precise` | `SearchZone` | `generatedAt` nul = module IA pas encore branché. |
| `POST /children/{id}/disappearance` | parent | 202 | Effets serveur (notification, fiche) à implémenter. |
| `GET/POST /children/{id}/emergency-contacts` | lecture : urgence/mobilisation ; écriture : parent | `EmergencyContact` | |
| `POST /children/{id}/audio/activate` | parent | `AudioActivationLog` | 403 tant que `AUDIO_ENABLED=false`. Motif ≥ 10 car. |
| `GET /children/{id}/audio/logs` | parent | `AudioActivationLog[]` | |
| `GET/PATCH /children/{id}/device/settings` | lecture : accès ; écriture : parent | `{energyMode, sensitivity, configVersion}` | `configVersion` +1 seulement si la valeur change. |
| `GET/POST /community/reports` | session | `CommunityReport` | Liste = signalements **modérés** uniquement. |

## Temps réel

`WSS /api/v1/ws?token=<accessToken>&childId=<id>` — un socket par enfant suivi.

| Événement | `data` | Droit du destinataire |
|---|---|---|
| `position_update` | `{lat, lon, speedKmh, accuracyM, heading, fixQuality, battery, ts}` | `position_precise` |
| `risk_update` | `{score, state, reasons, ts}` | accès |
| `alert` | `{id, childId, level, score, reasons, status, createdAt}` | `alertes_urgence` / `alertes_prealerte` selon `level` |

Fermetures : `4001` jeton invalide (l'app rafraîchit puis rouvre), `4003` accès refusé.
Le client envoie `ping` (25 s) ; le serveur répond `pong`.

**o2switch mutualisé** : Passenger (WSGI) ne gère pas le WebSocket. Laisser
`EXPO_PUBLIC_WS_URL` vide : l'app passe en polling REST (score de chaque enfant
toutes les 15 s, position 20 s), et l'écran d'urgence se déclenche sur le score.

## Notifications push (FCM)

`data` : `child_id`, `alert_id`, `childId`, `alertId`, `level` (`urgence|prealerte`), `score`.
Canal Android : `siren-urgence` (priorité max), `siren-prealerte`, `siren-information`.
L'app valide les identifiants avant toute navigation.
