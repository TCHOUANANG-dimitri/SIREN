# Cahier des charges logiciel — SIREN (finalisation, octobre 2026)

Référence : `docs/PROMPT_MAITRE_CLAUDE_CODE_SIREN.md` (exigences A à J) et cahiers des charges d'origine (`docs/CDC-CONTRADICTIONS.md`, `docs/TRACABILITE.md`). Ce document décrit **ce qui est exigé et ce qui est réellement livré**, avec la preuve. Statuts : **TERMINÉE** (implémentée et testée ici), **PARTIELLE** (code prêt, validation réelle manquante), **BLOQUÉE** (dépend d'un accès, d'un fournisseur ou d'un matériel absent). Les tâches non terminées ont une fiche dans `docs/TACHES_DIFFEREES.md`.

Date de vérification : 2026-10-21.

## 1. Périmètre

- Application mobile Expo / React Native (`src/`), backend FastAPI + PostgreSQL/PostGIS (`server/`), schéma (`data/`), déploiement (`deploy/contabo/`, `.github/workflows/`).
- Hors périmètre : firmware du traceur, contrats fournisseurs, achat du VPS et du domaine.

## 2. Exigences fonctionnelles et de sécurité

### A. Intégration et déploiement continus
- CI GitHub reproductible (lint, types, i18n, tests app et serveur, bundle Android, schéma reproductible, tests PostGIS, images Docker, conformité prod, gitleaks, audits).
- CD séparé : tag `vX.Y.Z`, environnement protégé, images immuables, contrôle de santé, retour arrière.
- Production Contabo : base non publiée, rôle applicatif à moindre privilège, images épinglées, sauvegardes avec rétention, test de restauration, procédure de retour arrière.

### B. Base de données
- Migrations versionnées, additives, réversibles (rollback commenté), journal `schema_migrations` avec empreintes.
- Validation et autorisation côté serveur ; aucun champ privé exposé.

### C. MFA / OTP
- Code alphanumérique ≤ 6 caractères, aléatoire cryptographique, sans caractères ambigus.
- Canal au choix : SMS, WhatsApp, e-mail (seulement s'il existe et est vérifié) ; téléphone obligatoire.
- Adaptateurs configurés par variables d'environnement ; adaptateur factice réservé aux tests.
- Expiration courte, usage unique, invalidation au renvoi, stockage haché, essais limités, limites par compte / destination / IP, pas d'énumération, pas de code dans les journaux, usages séparés.

### D. Téléphone obligatoire, e-mail facultatif
- Validation internationale E.164 côté serveur sans longueur fixe ; jamais d'e-mail inventé ; transition des comptes existants.

### E. Changement de téléphone
- Mot de passe vérifié côté serveur, code au nouveau numéro avant modification, protections rejeu/concurrence, ancien numéro prévenu.

### F. Appairage
- QR = `SIREN-XXXXX-XXXXX` exact, sensible à la casse, aucune conversion ; pas de doublon ; propriété, dissociation, ré-association.
- Saisie manuelle : 10 caractères, préfixe et tiret automatiques, collage, caractères invalides, pas de saut de curseur, validation à 10 caractères.
- QR traité comme donnée (jamais d'URL ouverte). Preuve de possession du protocole (PIN) ou risque documenté.

### G. Alerte critique
- Pas de troncature ni chevauchement, défilement, zones sûres, accessibilité ; boutons critiques jamais masqués ; tests d'interface.

### H. Relais / store-and-forward
- Référence : protocole de `docs/`. Machine d'états, file persistante, idempotence, réessais avec attente, TTL, persistance serveur puis livraison au seul compte autorisé ; relais sans lecture ni falsification ; pas de chiffrement fictif ; simulateur si matériel absent.

### I. Carte
- Distinguer position du dispositif, position du téléphone (après autorisation explicite) et dernière position connue ; gérer refus, refus définitif, localisation désactivée, données périmées ; jamais de coordonnée inventée.

### J. Sécurité transverse
- TLS, validation, autorisation, limitation de débit, en-têtes de sécurité, CORS, journaux masqués, audit des dépendances, tests de sécurité ciblés.

## 3. Matrice de couverture

| # | Exigence | Fichiers / composants | Tests réellement exécutés | Résultat | Statut |
|---|---|---|---|---|---|
| A1 | CI GitHub | `.github/workflows/ci.yml` | actionlint 1.7.7 ; chaque étape rejouée localement (lint, tsc, i18n, jest, `expo export`, pytest, PostGIS, `docker compose config` + `check_compose.py`, gitleaks, audits) | OK localement ; **jamais exécutée sur GitHub** (aucun push autorisé) | PARTIELLE (T-CI-FIRST-RUN) |
| A2 | CD séparé, rollback | `.github/workflows/cd.yml`, `deploy/contabo/deploy.sh`, `rollback.sh`, `lib.sh` | actionlint ; répétition locale complète : 1er déploiement, mise à jour, version cassée → retour automatique, retour manuel registre injoignable | OK (2 défauts trouvés et corrigés par la répétition) ; CD réelle non exécutée | BLOQUÉE (T-CONTABO-DEPLOY) |
| A3 | Base non publique, moindre privilège | `deploy/contabo/docker-compose.prod.yml`, `sql/app_role.sql`, `check_compose.py` | répétition : aucun port hors proxy, base sans accès Internet, API connectée en `siren_app`, FS API en lecture seule ; 29 tests d'intégration connectés en `siren_app` ; DDL refusé | OK | TERMINÉE (code) / prod BLOQUÉE |
| A4 | Sauvegardes, rétention, restauration | `backup.sh`, `restore.sh`, `verify-restore.sh`, `install.sh` (cron) | sauvegarde réelle, rétention (5 gardées sur 9), restauration vérifiée, refus d'écraser la prod, fichier altéré détecté, vérification après copie hors site | OK ; chiffrement `age` et copie `rclone` non exécutés (outils/stockage absents) | PARTIELLE (T-BACKUP-OFFSITE) |
| A5 | Préparation VPS | `deploy/contabo/install.sh` | shellcheck | non exécuté (aucun VPS) | BLOQUÉE (T-CONTABO-DEPLOY) |
| B1 | Migrations versionnées | `server/migrations/004_*.sql`, `005_positions_source.sql`, `apply.py` | appliquées à la base de dev (2 passages idempotents) ; schéma régénéré (`rebuild-schema.sh`) ; `test_schema_consistency.py` | OK | TERMINÉE |
| B2 | Pas de champ privé exposé, validation serveur | `schemas/auth.py` (`extra="forbid"`), endpoints, `rate_limit.py` | pytest (unitaires + intégration) | OK | TERMINÉE |
| C1 | Code alphanumérique, aléatoire, haché | `server/app/services/otp.py` | `test_otp_and_emails.py`, `test_database_v2.py::test_verification_du_telephone_usage_unique` (code et jeton absents en clair) | OK | TERMINÉE |
| C2 | Expiration, usage unique, renvoi, essais | `otp.py` (`consume` verrouillé) | `test_code_expire`, `test_renvoi_invalide_le_code_precedent_et_essais_limites`, `test_double_validation_simultanee_un_seul_succes` | OK | TERMINÉE |
| C3 | Limites compte / destination / IP | `otp.py`, `rate_limit.py` | `test_plafonds_par_destination_et_par_ip`, `test_connexion_par_telephone_et_limitation` | OK | TERMINÉE |
| C4 | Usages séparés, pas d'énumération | `otp.py`, `auth.py` | `test_usages_separes`, `test_mot_de_passe_oublie_par_telephone`, `test_forgot_password_does_not_reveal_unknown_accounts` ; bcrypt factice pour un compte inconnu (temps non mesuré) | OK | TERMINÉE |
| C5 | Choix du canal, e-mail vérifié seulement | `otp.allowed_channels`, `ChannelPicker.tsx`, `otp.tsx` | `test_account_security.py`, `test_connexion_en_deux_etapes`, `src/api/mock/__tests__/auth.test.ts` | OK | TERMINÉE |
| C6 | Adaptateurs SMS / WhatsApp / e-mail réels | `server/app/services/otp_delivery.py` | adaptateur de test seulement ; « canal non configuré jamais simulé » testé | fournisseurs réels **non testés** | BLOQUÉE (T-OTP-PROVIDERS) |
| D1 | Téléphone obligatoire E.164 | `core/phone.py`, migration 004 (trigger, contrainte, index), `register.tsx`, `features/auth/phone.ts` | `test_telephone_obligatoire_email_facultatif` (API + base), `test_account_security.py` | OK | TERMINÉE |
| D2 | E-mail facultatif, jamais inventé | `models/user.py`, `contracts`, mock | idem + test mock | OK | TERMINÉE |
| D3 | Comptes existants sans téléphone | `phoneRequired`, `(main)/_layout.tsx`, `settings/phone.tsx` | typecheck ; parcours non testé sur appareil | code OK | PARTIELLE (T-UI-VISUAL ; `NOT NULL` : T-DB-PHONE-NOTNULL) |
| E1 | Changement de numéro sécurisé | `users.py` (`/me/phone`, `/me/phone/confirm`), `security_notifications.py`, `settings/phone.tsx` | `test_changement_de_numero` (mauvais mot de passe, même numéro, numéro pris, mauvais code, rejeu, ancien numéro prévenu), `…code_d_un_autre_compte_refuse`, `…pris_entre_temps`, `…fournisseur_indisponible`, `test_double_validation_simultanee_un_seul_succes` | OK | TERMINÉE (envoi SMS réel : T-OTP-PROVIDERS) |
| F1 | Format exact, sensible à la casse | `core/serial.py`, `features/pairing/serial.ts`, contrainte `ck_devices_serial_format` | `test_account_security.py`, `serial.test.ts`, `test_appairage_strict_pin_dissociation_reassociation` | OK | TERMINÉE |
| F2 | Saisie manuelle formatée | `components/SerialInput.tsx`, `nextSerialInput` | `serial.test.ts` (curseur, collage, tiret), `critical.test.tsx` (rendu RNTL) | OK en tests ; clavier réel non vérifié | PARTIELLE (T-UI-VISUAL) |
| F3 | QR traité comme donnée | `parseQrPayload`, `add-child.tsx` | `serial.test.ts` (URL, `javascript:`, suffixe) | OK | TERMINÉE |
| F4 | Propriété, doublon, dissociation, ré-association | `children.py`, `DeviceTab.tsx`, `add-child.tsx?childId=` | `test_appairage_*` (3 tests), index unique | OK | TERMINÉE |
| F5 | Preuve de possession (PIN) | `devices.activation_pin_hash`, `resolve_device_for_pairing` | PIN requis / faux / juste, échecs limités | OK ; PIN non provisionnés en fabrication | BLOQUÉE (T-DEV-PIN) |
| G1 | Alerte critique utilisable | `src/app/(emergency)/urgence.tsx`, `Button.tsx` | `critical.test.tsx` : appels hors défilement, codes techniques jamais affichés, nom long non tronqué, carte sans capture de geste, appel des secours | OK en RNTL ; **aucune vérification visuelle sur appareil** | PARTIELLE (T-UI-VISUAL) |
| H1 | Protocole serveur (trames, événements, commandes, accusés) | `services/device_protocol.py`, `device_ingestion.py`, `device_commands.py`, `services/device_commands.py`, tâches `commands` | `test_device_protocol.py` (30 cas), `test_trame_http_*`, `test_commande_*` | OK | TERMINÉE (canal MQTT : T-DEV-MQTT) |
| H2 | Relais idempotent, compte autorisé seulement | `POST /device/v1/relay`, `device_relay_events`, `positions.source` | `test_relais_par_telephone_autorise_et_idempotent` | OK | TERMINÉE (risque D-08) |
| H3 | Store-and-forward côté app | `src/features/deviceLink/*` | `deviceLink.test.ts` (12 tests : états, persistance, doublons, lots, refus, backoff, TTL, borne, concurrence, simulateur) | OK | TERMINÉE (logique) |
| H4 | Transport local réel (BLE) | — | — | protocole absent du document de référence | BLOQUÉE (T-BLE-01) |
| I1 | Carte : 3 positions distinctes | `MapTab.tsx`, `PhoneLocationControl.tsx`, `stores/locationStore.ts` | typecheck ; `phoneLocation.test.ts` | OK en logique ; rendu non vérifié sur appareil | PARTIELLE (T-UI-VISUAL) |
| I2 | Permissions (refus, définitif, services coupés) | `phoneLocation.ts`, `locationStore.ts` (plus de demande au démarrage) | `phoneLocation.test.ts` | OK | TERMINÉE |
| J1 | En-têtes de sécurité, CORS restreint, docs fermées en prod | `core/security_headers.py`, `main.py`, `Caddyfile`, `Caddyfile.prod` | `test_security_headers_on_api_responses` ; répétition (HSTS, CSP, `no-store`, `/docs` 404) | OK | TERMINÉE |
| J2 | IP client non falsifiable | `rate_limit.client_ip` | `test_client_ip_ignores_spoofable_forwarded_entries` | OK | TERMINÉE |
| J3 | Audit des dépendances | `package-lock.json`, `requirements*.txt`, `ci.yml` | `npm audit` (critique : 0), `pip-audit` | correctifs compatibles appliqués ; 47 « high » restent dans la chaîne Expo | PARTIELLE (T-DEPS-EXPO) |
| J4 | Secrets | `.gitignore`, `env.prod.example`, gitleaks | gitleaks sur l'historique (1 faux positif annoté) et le répertoire | aucun secret réel trouvé | TERMINÉE |
| §4 | Agents et `CLAUDE.md` | `.claude/agents/*.md`, `CLAUDE.md` | relecture | — | TERMINÉE |

## 4. Critères d'acceptation globaux (§9 du prompt maître)

| Critère | État |
|---|---|
| Tâches dans la matrice avec statut honnête | Oui (ce document + `TACHES_DIFFEREES.md`) |
| Pas de régression | Oui : app 29 suites / 238 tests, serveur 237 + 38 intégration PostGIS (en `siren_app`), lint 0 erreur |
| Téléphone obligatoire, e-mail facultatif | Oui |
| MFA multi-canal, codes expirables / uniques / limités | Oui (fournisseurs réels : BLOQUÉ) |
| Changement de téléphone sécurisé | Oui |
| QR et saisie exacts, appairage métier | Oui (PIN fabricant : BLOQUÉ) |
| Alerte critique | Corrigée et testée en RNTL ; validation visuelle sur appareil **manquante, signalée** |
| Relais cohérent avec le protocole réel | Oui pour le serveur et la logique ; transport BLE absent du protocole : BLOQUÉ |
| Carte sans confusion des positions | Oui |
| CI reproductible, CD contrôlé, base non publiée | Oui en local et en répétition ; jamais exécutés sur GitHub / Contabo |
| Sauvegarde, restauration, retour arrière | Documentés et testés localement |
| Cahiers des charges et des coûts sans tarif inventé | Oui (`CAHIER_DES_COUTS.md`, sources datées, [ND] quand non vérifiable) |
| Revue indépendante | Oui : agents `qa-security` et `devsecops` en lecture seule (11 majeurs, aucun bloquant) ; majeurs corrigés et testés, résidus consignés — `PLAN_TESTS_SECURITE.md` §5, `TACHES_DIFFEREES.md` (T-AUTH-RESIDUAL, T-WS-TOKEN, T-OPS-ALERTING, T-DEPS-PIN) |
