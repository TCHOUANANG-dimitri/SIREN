# Décisions techniques — SIREN

Décisions structurantes prises pendant la finalisation logicielle (octobre 2026). Chaque entrée : contexte, décision, alternatives écartées, conséquences. Les identifiants `D-xx` sont cités dans le code.

| ID | Sujet | Statut |
|---|---|---|
| D-01 | Téléphone identifiant principal, e-mail facultatif | Adoptée |
| D-02 | Codes à usage unique alphanumériques, multi-canal | Adoptée |
| D-03 | Limitation de débit en base (sans Redis) | Adoptée |
| D-04 | Comptes existants sans téléphone : complétion à la connexion | Adoptée |
| D-05 | Changement de numéro en deux étapes | Adoptée |
| D-06 | Numéro de série strict et sensible à la casse | Adoptée |
| D-07 | Preuve de possession à l'appairage : PIN d'activation | Adoptée (PIN dépendant du fabricant) |
| D-08 | Relais par téléphone de trames non signées | Adoptée avec risque résiduel |
| D-09 | Pas de BLE inventé : logique de relais agnostique + simulateur | Adoptée |
| D-10 | Commandes descendantes : FAILED immédiat sans canal | Adoptée |
| D-11 | Production Contabo : base privée, rôle applicatif, images épinglées | Adoptée |
| D-12 | CI réutilisée par la CD, déploiement avec retour arrière automatique | Adoptée |

---

## D-01 — Téléphone identifiant principal, e-mail facultatif

- **Contexte :** exigence D du prompt maître ; public camerounais, e-mail peu fiable ou absent.
- **Décision :** `users.telephone` obligatoire pour toute nouvelle ligne (trigger `trg_users_require_telephone`, migration 004), normalisé en E.164 côté serveur par `phonenumbers` (`server/app/core/phone.py`, région par défaut `PHONE_DEFAULT_REGION=CM`), unique parmi les comptes actifs (`uq_users_telephone_active`). `users.email` devient NULL-able ; aucun e-mail n'est jamais fabriqué. Connexion par `identifier` (téléphone dans tout format, ou e-mail).
- **Alternatives écartées :** longueur fixe de 9 chiffres (faux pour les numéros étrangers) ; e-mail factice `<tel>@siren.local` (interdit, et dangereux pour les notifications).
- **Conséquences :** l'app valide seulement la plausibilité E.164 (`src/features/auth/phone.ts`), le serveur reste juge (`phone_invalid`). La contrainte `ck_users_telephone_e164` est `NOT VALID` : elle s'applique aux nouvelles écritures sans bloquer d'anciennes lignes non normalisées.

## D-02 — Codes à usage unique alphanumériques, multi-canal

- **Décision :** 6 caractères dans un alphabet sans ambiguïté (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 31 symboles ≈ 29,7 bits), tirés par `secrets` ; saisie tolérante (minuscules, espaces). Stockage HMAC-SHA256 (code et jeton de challenge), durée 10 min, 5 essais, usage unique (verrou de ligne `FOR UPDATE`), renvoi = invalidation du précédent, usages séparés (`phone_verify`, `signup_verify`, `login_2fa`, `password_reset`, `phone_change`). Canaux : SMS (Twilio ou Africa's Talking), WhatsApp (Cloud API, modèle « authentication »), e-mail **seulement s'il est vérifié** et jamais pour un changement de numéro. Un canal non configuré n'est jamais proposé ni simulé (`503 channel_unavailable`).
- **Alternatives écartées :** code numérique (moins d'entropie pour 6 caractères) ; TOTP (pas d'application d'authentification chez la cible) ; envoi SMS via le dispositif (non prévu par le protocole).
- **Conséquences :** sans contrat fournisseur, aucun code réel ne part (tâche T-OTP-PROVIDERS). En développement, `OTP_MODE=dev` renvoie le code dans `devHint`, refusé hors `ENVIRONMENT=development`.

## D-03 — Limitation de débit en base

- **Décision :** table `rate_limit_events` (clés HMAC, jamais en clair), fenêtre glissante, partagée par connexion (compte + IP), inscription (IP), envoi de codes (compte+usage, destination, IP), appairage (échecs par compte), recherche de dispositif, relais, commandes. Les échecs sont validés (`commit`) avant de renvoyer l'erreur, sinon le rollback de la requête les effacerait. Purge horaire (> 48 h).
- **Alternatives écartées :** Redis (absent sur l'hébergement mutualisé o2switch encore supporté) ; limitation au proxy seul (pas de notion de compte).
- **Conséquences :** IP client = **dernière** adresse de `X-Forwarded-For` (celle ajoutée par le mandataire de confiance) ; `TRUST_PROXY_HEADERS=false` si l'API est exposée sans mandataire.

## D-04 — Comptes existants sans téléphone

- **Décision :** pas de `NOT NULL` brutal : le trigger ne vise que les INSERT. Un compte ancien sans numéro reçoit `phoneRequired: true` ; l'app redirige vers *Réglages › Numéro de téléphone* (mot de passe + code au nouveau numéro) avant toute autre page. L'écran d'urgence reste hors de ce parcours.
- **Sortie :** quand plus aucun compte actif n'a `telephone IS NULL`, une migration pourra poser `NOT NULL` et `VALIDATE CONSTRAINT ck_users_telephone_e164` (tâche T-DB-PHONE-NOTNULL).

## D-05 — Changement de numéro en deux étapes

- **Décision :** `POST /users/me/phone` (mot de passe vérifié côté serveur, limité, numéro normalisé, libre et différent) → code envoyé **au nouveau numéro** (`phone_change`, valeur en attente stockée dans le challenge) ; `POST /users/me/phone/confirm` consomme le code (verrou), vérifie que le challenge appartient au compte, revérifie l'unicité (course possible) puis l'index unique tranche (`IntegrityError` → `409 phone_taken`). L'ancien numéro est prévenu par SMS au mieux (nouveau numéro masqué). `PATCH /users/me` refuse désormais `telephone` (`extra="forbid"`).

## D-06 — Numéro de série strict

- **Décision :** format exact `^SIREN-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$`, **sensible à la casse**, sans aucune conversion (suppression de tous les `toUpperCase()` / `.upper()`), contrôlé dans l'app (`src/features/pairing/serial.ts`), l'API (`server/app/core/serial.py`) et la base (`ck_devices_serial_format`, `NOT VALID` pour ne pas bloquer d'anciens boîtiers). QR : le contenu est une donnée ; seul un numéro exact est accepté, aucune URL n'est ouverte. Saisie manuelle : préfixe `SIREN-` et tiret affichés, 10 caractères tapés, collage accepté, caractères invalides ignorés et signalés, curseur conservé, validation à 10 caractères.
- **Conséquences :** les identifiants de démonstration ont été convertis au nouveau format (base mock v2).

## D-07 — Preuve de possession à l'appairage

- **Contexte :** le protocole de référence décrit un « PIN d'activation de 6 caractères imprimé sur la boîte, exigé au premier appairage ». Le numéro de série seul (visible sur le boîtier) n'est **pas** une preuve de possession.
- **Décision :** `devices.activation_pin_hash` (bcrypt). S'il est renseigné, le PIN est exigé (`pin_required` / `pin_invalid`, échecs limités) ; une fois la possession prouvée, un boîtier suivi par une autre famille répond `409 device_taken` (l'ancien propriétaire doit dissocier). Sans PIN enregistré, un boîtier suivi répond comme inconnu (`404 device_not_found`) pour ne pas révéler qu'il est suivi. Dissociation (`DELETE /children/{id}/device`) et ré-association (`PUT /children/{id}/device`) réservées au parent principal ; les commandes en attente passent à `FAILED`.
- **Risque résiduel :** tant que la chaîne de fabrication ne fournit pas les PIN (T-DEV-PIN), un tiers connaissant le numéro d'un boîtier **non encore associé** peut l'associer à son compte. Atténuations : limitation des échecs et des recherches, dissociation possible par le vrai propriétaire.

## D-08 — Relais par téléphone de trames non signées

- **Contexte :** les trames « ; » du protocole (§7.1) ne sont ni signées ni chiffrées ; leur authenticité repose sur le canal (identifiants MQTT par traceur, clé du dispositif en HTTP).
- **Décision :** `POST /device/v1/relay` n'accepte une trame que du **parent principal ou d'un proche ayant le droit `position_precise`** sur l'enfant associé au traceur (sinon `forbidden`, sans fuite d'information ; une trame relayée déclenche score, alertes et notifications) ; idempotence par empreinte SHA-256 (`device_relay_events`, contrainte unique) et fenêtre de ± 2 s sur les positions (avec `pg_advisory_xact_lock`) ; positions marquées `positions.source='relay'` (migration 005). Un relais ne met pas le boîtier « en ligne ». Côté app, la file locale stocke les trames dans le bac à sable de l'app, en clair, 72 h maximum, effacée à la déconnexion.
- **Risque résiduel :** un compte autorisé peut injecter de fausses positions pour son propre enfant ; la file locale n'est pas chiffrée au repos. Un tiers relayant les trames d'autrui n'est **pas** pris en charge (aucun moyen d'authentifier la trame). Lever ce risque exige une signature de trame par le firmware (T-DEV-FRAME-SIG).

## D-09 — Pas de BLE inventé

- **Constat :** `docs/transition-données-serveur.pdf` décrit ESP32 + modem A9G (GPRS) → broker MQTT → serveur → WebSocket → app. **Aucun lien BLE** téléphone ↔ traceur n'y figure.
- **Décision :** aucune implémentation BLE ni protocole GATT inventé. Implémenté et testé : machine d'états du lien, file persistante bornée avec TTL/idempotence/attente exponentielle, session qui ne relaie que les trames du dispositif associé, transport simulé (`src/features/deviceLink/`), et toute la partie serveur. Le transport réel reste BLOQUÉ (T-BLE-01).

## D-10 — Commandes descendantes

- **Décision :** table `device_commands` (PENDING → SUCCESS | FAILED | TIMEOUT). Message signé `HMAC-SHA256(cmd|valeur)` (clé partagée `DEVICE_COMMAND_SIGNING_KEY`), accusé `POST /device/v1/ack` refusé sans signature valide `HMAC(ok|detail)`, expiration à 2 min (tâche planifiée chaque minute). Sans canal configuré, la commande est enregistrée **FAILED `no_channel`** immédiatement (protocole §8 : « pas de faux espoir ») et `/position/fix` répond `delivered: false`. `NUMERO_SMS` et `RESET_USINE` ne sont pas exposés.
- **Hypothèse à confirmer :** sérialisation de `ok` en `true`/`false` dans la chaîne signée (T-DEV-ACK-FORMAT). Publication MQTT non branchée (T-DEV-MQTT).

## D-11 — Production Contabo

- **Décision :** surcouche `deploy/contabo/docker-compose.prod.yml` : images applicatives publiées sur GHCR (tag immuable), images tierces épinglées par digest ; aucun port publié sauf Caddy (80/443) ; base et Redis sur un réseau Docker `internal` (sans accès Internet) ; API en système de fichiers en lecture seule, `no-new-privileges`, `cap_drop: ALL` ; l'API se connecte avec `siren_app` (DML seulement, `BYPASSRLS`, aucun DDL) ; les migrations avec le propriétaire du schéma ; partitions créées par fonction `SECURITY DEFINER`.
- **Pourquoi `BYPASSRLS` :** RLS est activée sans politique sur les tables (héritage Supabase) ; un rôle non propriétaire ne verrait aucune ligne. L'isolation entre familles est appliquée et testée dans l'API (`app/core/authz.py`). Écrire des politiques RLS par famille est une amélioration possible (T-DB-RLS).
- **Vérifié localement :** les 38 tests d'intégration passent connectés en `siren_app` ; `CREATE TABLE`, `DROP TABLE` et l'écriture dans `schema_migrations` sont refusés.
- **Secrets par conteneur (après revue) :** le mot de passe du propriétaire de la base est effacé de l'environnement de l'API, du worker et de beat ; le proxy ne reçoit que `DOMAIN` et `CADDY_EMAIL`. `TRUST_PROXY_HEADERS` est désactivé par défaut et activé par la seule surcouche de production, où l'API ne publie aucun port.

## D-12 — CI/CD

- **Décision :** `ci.yml` (push, PR, `workflow_call`) : app (lint, types, i18n, tests, bundle Android, `npm audit`), serveur (pytest, `pip-audit`), base (schéma reproductible depuis les migrations + tests d'intégration PostGIS), images Docker, conformité de la configuration de production, gitleaks sur tout l'historique. `cd.yml` (tag `vX.Y.Z` ou manuel) : réutilise la CI, publie les images, déploie par SSH sous l'environnement GitHub `production` (approbation exigée), contrôle de santé public. Actions épinglées par SHA de commit.
- **Relance manuelle :** depuis le tag uniquement (la CI teste exactement le commit déployé) ; un tag déjà publié n'est jamais reconstruit.
- **Retour arrière :** `deploy.sh` sauvegarde la base avant chaque déploiement, n'inscrit la version qu'après le contrôle `/health/ready`, puis rétablit automatiquement la version précédente si le démarrage ou le contrôle de santé échoue ; la base n'est jamais restaurée automatiquement (migrations additives, restauration = décision humaine).
