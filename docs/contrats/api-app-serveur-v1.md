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
| Erreurs | `{ "detail": { "code": "<motif>", "message": "…", "params"?: {…} } }` pour les erreurs métier (voir « Erreurs métier »), ou `{ "detail": "…" }` (erreurs génériques, 422 de validation). L'app n'affiche jamais `detail.message` : elle traduit `detail.code` (`apiErrors.reasons.*`), sinon le statut HTTP (`apiErrors.*`). |

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
| `GET /auth/otp/channels` | — | `{channels: ("sms"|"whatsapp"|"email")[], codeLength}` | Canaux réellement configurés ; un canal absent n'est jamais proposé. |
| `POST /auth/register` | — | `{user, accessToken, refreshToken}` | **`telephone` obligatoire** (tout format, normalisé E.164 ; 422 `phone_invalid`), `email` **facultatif**. Mot de passe ≥ 10 car., minuscule, majuscule, chiffre, symbole. Optionnels : `langue`, `acceptedTermsVersion`, `acceptedPrivacyVersion`. 409 `phone_taken` / `email_taken` ; 429 `rate_limited` (par IP). |
| `POST /auth/login` | — | `{user, accessToken, refreshToken, twofaRequired:false}` **ou** `{twofaRequired:true, mfaToken, channels}` | `{identifier, password}` (téléphone ou e-mail ; ancien champ `email` accepté). Avec 2FA, **aucun jeton de session** : `mfaToken` (5 min) ne sert qu'à `/2fa/send`. 401 `invalid_credentials` (même réponse si le compte n'existe pas) ; 429 `rate_limited` (compte, IP). |
| `POST /auth/2fa/send` | — | `{challengeToken, expiresIn, channel, sent[, devHint]}` | `{mfaToken, channel}` ; (r)envoi, invalide le code précédent. 400 `channel_not_allowed`, 503 `channel_unavailable`, 502 `delivery_failed`, 429 `otp_rate_limited`. |
| `POST /auth/2fa/verify` | — | `{user, accessToken, refreshToken}` | `{challengeToken, code}`. `otp_invalid` (400), `otp_expired` (400), `otp_attempts_exceeded` (429), `challenge_invalid` (400). |
| `POST /auth/2fa/resend` | — | idem `/2fa/send` | Compatibilité : même canal que le précédent. Seul un challenge **encore valable** (ni consommé, ni expiré, ni invalidé par un changement de mot de passe) est renouvelable, sinon `400 challenge_invalid`. |
| `POST /auth/refresh` | — | `{accessToken, refreshToken}` | Rotation. |
| `POST /auth/logout` | — | 204 | Révoque le refresh token. |
| `POST /auth/request-otp` | — | `{required, sent, challengeToken?, expiresIn?, channel?, devHint?}` | `{accessToken, channel, target: "phone"|"email"}` ; `phone` = vérification du téléphone (SMS/WhatsApp **uniquement** : `channel=email` → `400 channel_not_allowed`), `email` = vérification de l'adresse. `required=false` : étape non requise (`OTP_MODE`). |
| `POST /auth/verify-otp` | — | `{verified, user}` | `{code, challengeToken}` ; marque le téléphone (`phoneVerified`) ou l'e-mail vérifié. |
| `POST /auth/forgot` | — | `{challengeToken, expiresIn[, devHint]}` | `{identifier, channel}`. **Même réponse** que le compte existe ou non, et si le plafond du compte est atteint. 503 `channel_unavailable` si le canal n'est pas configuré ; 429 `rate_limited` (IP). |
| `POST /auth/reset-password` | — | 204 | `{challengeToken, code, newPassword}` ; révoque toutes les sessions ; alerte de sécurité. |
| `GET/PATCH /users/me` | session | `User` (`phoneVerified`, `phoneRequired`) | PATCH : `nom`, `langue` uniquement (`telephone` refusé, 422). |
| `POST /users/me/phone` | session | `{challengeToken, expiresIn, channel, sent}` | `{currentPassword, newPhone, channel: sms|whatsapp}` ; code envoyé **au nouveau numéro**. 400 `password_incorrect`, 422 `phone_invalid`, 409 `phone_unchanged` / `phone_taken`, 503 `channel_unavailable`, 429. |
| `POST /users/me/phone/confirm` | session | `User` | `{challengeToken, code}` ; le numéro n'est remplacé qu'ici ; 409 `phone_taken` (pris entre-temps) ; l'ancien numéro est prévenu. |
| `DELETE /users/me` | session | 204 | Révoque sessions et jetons push, désactive les enfants, révoque les partages. |
| `POST /users/me/password` | session | `{accessToken, refreshToken}` | `{currentPassword, newPassword}` ; autres sessions révoquées ; 400 `password_incorrect`. |
| `PUT /users/me/2fa` | session | `User` | `{enabled, password}` ; 400 `password_incorrect` ; activation refusée (503 `channel_unavailable`) sans canal. |
| `POST /users/me/push-token` | session | 204 | `{token, platform: fcm|apns}` (jeton natif, pas Expo Push). |
| `GET /children` | session | `Child[]` | |
| `POST /children` | parent | `Child` | `{prenom, deviceId, activationPin?, photoUrl?}` ; `deviceId` = `SIREN-XXXXX-XXXXX` exact, **sensible à la casse** (422 `serial_invalid`). 404 `device_not_found` (inconnu, ou suivi ailleurs sans PIN), 403 `pin_required` / `pin_invalid`, 409 `device_taken` (possession prouvée, suivi ailleurs) / `device_already_paired`, 429 `rate_limited` (5 échecs / 15 min). |
| `GET /children/devices/{deviceId}` | session | `{deviceId, online, battery, configVersion, firmwareVersion, pinRequired}` | 404 aussi si déjà associé ailleurs ; 30 recherches / h. |
| `PUT /children/{id}/device` | parent principal | `Child` | (Ré)association `{deviceId, activationPin?}` ; mêmes erreurs ; l'ancien boîtier est libéré. |
| `DELETE /children/{id}/device` | parent principal | `Child` (`deviceId` nul) | Dissociation ; historique conservé ; commandes en attente → FAILED. 404 `no_device`. |
| `POST /children/{id}/commands` | LOCALISER : `position_precise` ; MODE, REDEMARRER : parent principal | 201 `{id, code, valeur, status, detail, createdAt, respondedAt}` | `status` = `PENDING` si publiée, `FAILED` (`no_channel`) sinon. 422 `command_unknown` / `command_value_invalid`. 6 / min / enfant. |
| `GET /children/{id}/commands/{commandId}` | accès | idem | Suivi ; mise à jour poussée aussi par l'événement `command_update`. |
| `POST /device/v1/relay` | session (parent principal, ou proche ayant le droit `position_precise` sur l'enfant du traceur) | `{results: [{status: accepted|duplicate|rejected|forbidden, reason?, eventId?}]}` | `{frames: [{frame}]}` (≤ 100) ; trames « ; » du protocole relayées telles quelles ; idempotent ; une trame non écrite (doublon d'une trame directe, horodatage hors fenêtre) libère son empreinte et peut être renvoyée. |
| `GET/PATCH /children/{id}` | accès / parent | `Child` | `sleepSchedule: {jours, heureDebut, heureFin}`. |
| `GET /children/{id}/status` | accès | `DeviceStatus` | `energyMode` ∈ `continu|equilibre|economie`, `sensitivity` texte `"0".."100"`. |
| `GET /children/{id}/position` | `position_precise` | `Position` ou **204** | Clé d'horodatage : `ts`. |
| `POST /children/{id}/position/fix` | `position_precise` | 202 `{accepted, delivered, commandId, status}` | Commande LOCALISER ; `delivered:false` tant qu'aucun canal (MQTT) n'est configuré. |
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
| `GET/POST /children/{id}/shares` | parent | `SecondaryAccess` (+ `notified` à la création) | Identifiant normalisé (email en minuscules, téléphone sans séparateurs, indicatif toléré). Erreurs : 422 `identifier_invalid`, 422 `self_invite`, 404 `invitee_not_found`, 409 `already_shared`, 409 `secondary_limit` (`params.max`). `notified` = un email a réellement été envoyé. |
| `GET/PATCH /children/shares/{id}` | parent ou invité | `SecondaryAccess` | L'invité peut accepter / se retirer, pas changer ses droits (403 `rights_owner_only`, 409 `invitation_invalid`). |
| `GET /children/{id}/permissions` | accès | `Permission[]` | |
| `GET /children/{id}/shares/audit` | parent | `AccessAuditEntry[]` | Alimenté par chaque lecture d'un secondaire. `infoType` = code du droit (`position_precise`, `etat_zone`, `historique`) ; entrées antérieures : libellé français historique. |
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
| `command_update` | commande (voir `/commands`) | accès à l'enfant |

Fermetures : `4001` jeton invalide (l'app rafraîchit puis rouvre), `4003` accès refusé.
Le client envoie `ping` (25 s) ; le serveur répond `pong`.

**o2switch mutualisé** : Passenger (WSGI) ne gère pas le WebSocket. Laisser
`EXPO_PUBLIC_WS_URL` vide : l'app passe en polling REST (score de chaque enfant
toutes les 15 s, position 20 s), et l'écran d'urgence se déclenche sur le score.

## Notifications push (FCM)

Texte rédigé par le serveur **dans la langue du destinataire** (`users.langue`) ;
catalogue `server/app/services/push.py`, identique à `notifications.push.*` côté app
(test `test_app_and_server_push_catalogs_match`).

`data` (toutes les valeurs sont des chaînes) :
`v` (`"1"`), `type` (`urgence|prealerte|low_battery|share_invite`), `titleKey`, `bodyKey`,
`vars` (JSON), `lang`, et selon le type `childId`/`child_id`, `alertId`/`alert_id`, `level`, `score`.
Un payload v1 sans `type` reste accepté (type déduit de `level`).
Canal Android : `siren-urgence` (priorité max), `siren-prealerte`, `siren-information`.
L'app valide les identifiants avant toute navigation. Détail des types : `docs/NOTIFICATIONS.md`.

## Erreurs métier (`detail.code`)

| Code | HTTP | Sens |
|---|---|---|
| `invalid_credentials` | 401 | Identifiant ou mot de passe incorrect |
| `email_taken` / `phone_taken` / `phone_unchanged` | 409 | E-mail ou téléphone déjà utilisé ; numéro identique |
| `phone_invalid` | 422 | Téléphone non valide (E.164) |
| `channel_unavailable` / `channel_not_allowed` / `delivery_failed` | 503 / 400 / 502 | Canal non configuré / non autorisé pour ce compte ou cet usage / refusé par le fournisseur — jamais de faux succès |
| `rate_limited` | 429 | Trop de tentatives (`params.retryAfter`) |
| `serial_invalid` / `device_not_found` / `pin_required` / `pin_invalid` / `device_taken` / `device_already_paired` / `no_device` | 422 / 404 / 403 / 403 / 409 / 409 / 404 | Appairage |
| `principal_only` | 403 | Action réservée au parent principal |
| `command_unknown` / `command_value_invalid` / `command_not_found` | 422 / 422 / 404 | Commandes du dispositif |
| `otp_invalid` / `otp_expired` / `otp_attempts_exceeded` / `otp_rate_limited` | 400 / 400 / 429 / 429 | Code à usage unique |
| `challenge_invalid` | 400 / 401 | Vérification inconnue, expirée ou compte indisponible |
| `email_unavailable` / `email_failed` | 503 / 502 | (v1, remplacés par `channel_unavailable` / `delivery_failed`) |
| `password_incorrect` | 400 | Mot de passe actuel incorrect |
| `session_invalid` | 401 | Refresh token invalide ou révoqué |
| `identifier_invalid` / `self_invite` / `invitee_not_found` / `already_shared` / `secondary_limit` | 422 / 422 / 404 / 409 / 409 | Partage |
| `rights_owner_only` / `invitation_invalid` | 403 / 409 | Réponse d'un invité |

Ajouter un code : serveur (`api_error`), `ErrorReason` (`src/api/errors.ts`) et
`apiErrors.reasons.<code>` en FR et EN.
