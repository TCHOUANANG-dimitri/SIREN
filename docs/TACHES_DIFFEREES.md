# Registre des tâches différées — SIREN

> **Modèle de travail.** Tenu à jour d'après `docs/MODELE_TACHES_DIFFEREES_SIREN.md`. Aucune tâche partielle, bloquée ou non testée n'est laissée dans les seules notes de session. Aucun mot de passe, clé API, jeton, clé privée ni valeur de secret ne figure ici : seuls les **noms** de variables sont cités.

## Résumé

- Date de dernière revue : `2026-10-21`
- Version/branche du projet : `master` (non commité ; base `bf88261`)
- Nombre de tâches terminées : `25` (lignes TERMINÉE de la matrice, `docs/CAHIER_DES_CHARGES.md` §3)
- Nombre de tâches partielles : `8` (T-CI-FIRST-RUN, T-BACKUP-OFFSITE, T-UI-VISUAL, T-DEPS-EXPO, T-PY-JOSE, T-DEV-ACK-FORMAT, T-AUTH-RESIDUAL, T-WS-TOKEN)
- Nombre de tâches bloquées : `6` (T-CONTABO-DEPLOY, T-OTP-PROVIDERS, T-DEV-PIN, T-BLE-01, T-DEV-MQTT, T-DEV-FRAME-SIG)
- Tâches non commencées : `4` (T-DB-PHONE-NOTNULL, T-DB-RLS, T-OPS-ALERTING, T-DEPS-PIN)
- Risques bloquants avant production : **aucun fournisseur OTP réel configuré** (sans lui, ni vérification du téléphone ni 2FA en production) ; **VPS, domaine et secrets GitHub absents** (aucun déploiement possible) ; **PIN d'activation non provisionnés** (appairage par simple numéro de série, risque D-07) ; **CI jamais exécutée sur GitHub**.

## Tâches différées

### `T-CONTABO-DEPLOY — Mise en production sur le VPS Contabo`

- **Priorité :** P0
- **Statut :** BLOQUÉE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice A2, A3, A5 (prompt maître §5.A)
- **Résultat attendu :** API servie en HTTPS sur le domaine définitif depuis le VPS, déployée par `cd.yml` sur tag, base non publiée, sauvegardes planifiées.
- **Ce qui manque exactement :** un VPS Contabo provisionné (Ubuntu 24.04), un nom de domaine et son enregistrement DNS A/AAAA, l'environnement GitHub `production` (variables, secrets, approbateurs), l'exécution de `install.sh` puis du premier déploiement.
- **Raison concrète du blocage/non-achèvement :** aucun accès VPS, domaine ni droit d'administration du dépôt GitHub fourni ; le prompt interdit tout déploiement sans autorisation explicite.
- **Actions déjà réalisées :** surcouche de production, Caddy de production, scripts d'installation, de déploiement, de retour arrière, de sauvegarde et de restauration ; workflow CD ; **répétition complète sur Docker local** : premier déploiement, mise à jour avec sauvegarde préalable, version cassée → retour automatique, retour manuel registre injoignable, vérification d'isolement réseau, du rôle `siren_app`, du FS en lecture seule, des en-têtes.
- **Logique métier déjà implémentée :** contrôle de disponibilité versionné (`/health/ready` : version ET base joignable en `siren_app`), version inscrite dans `.env.prod` seulement après succès, verrou `flock` contre les exécutions concurrentes, retour arrière automatique, refus d'écraser la base de production sans confirmation ; mot de passe du propriétaire de la base absent des conteneurs applicatifs, proxy limité à `DOMAIN`/`CADDY_EMAIL`, jeton WebSocket retiré des journaux Caddy.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** `SIREN_VERSION`, `SIREN_IMAGE_PREFIX` ; variables de répétition locale `COMPOSE_EXTRA`, `PULL`, `HEALTH_URL`, `CURL_EXTRA` (jamais en production).
- **Fichiers concernés :** `deploy/contabo/*`, `.github/workflows/cd.yml`, `docs/DEPLOIEMENT_CONTABO.md`.
- **Tests exécutés et résultats réels :** répétition locale (voir `docs/DEPLOIEMENT_CONTABO.md` §8) : tous scénarios OK après correction de 3 défauts (routage Caddy, retour arrière interrompu par `set -e`, `pull` bloquant au retour arrière) ; seconde répétition après la revue DevSecOps (premier déploiement, mise à jour, version cassée, `pull` en échec sans modification de `.env.prod`, verrou, retour manuel, isolement des secrets, journaux sans jeton) : OK.
- **Tests impossibles à exécuter et raison :** certificat Let's Encrypt réel, pare-feu UFW et durcissement SSH réels, CD GitHub de bout en bout — aucun serveur ni domaine.
- **Informations non sensibles à fournir :** offre VPS retenue, région, IP publique, nom de domaine, adresse e-mail ACME, nom GitHub des approbateurs, fenêtre de mise en production, personne autorisée à valider.
- **Accès ou secrets requis (noms des variables/secrets seulement) :**
  - GitHub (environnement `production`) : variables `CONTABO_HOST`, `CONTABO_USER`, `SIREN_DOMAIN` ; secrets `CONTABO_SSH_KEY`, `CONTABO_KNOWN_HOSTS`.
  - Serveur (`deploy/contabo/.env.prod`, mode 600) : `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `SECRET_KEY`, `JWT_SECRET_KEY` (+ fournisseurs, voir T-OTP-PROVIDERS). À saisir directement sur le serveur ou via le gestionnaire de secrets GitHub, jamais dans Git ni dans une conversation.
- **Matériel, firmware, OS ou service tiers requis :** VPS Contabo (Ubuntu 24.04), registre DNS du domaine, GHCR (packages du dépôt).
- **Étapes exactes pour reprendre :**
  1. Suivre `docs/DEPLOIEMENT_CONTABO.md` §3 (VPS, DNS) et §4 (`install.sh` avec une console de secours ouverte).
  2. Cloner le dépôt en `/home/deploy/siren`, créer `.env.prod` depuis `env.prod.example` (mode 600).
  3. Configurer l'environnement GitHub `production` (§5) puis pousser un tag `v1.0.0`.
  4. Vérifier la checklist de production (§9).
- **Critères d'acceptation de sortie :** `https://<domaine>/health` renvoie la version déployée ; `nmap` depuis l'extérieur ne montre que 22/80/443 ; une sauvegarde quotidienne existe et `verify-restore.sh` réussit sur le serveur ; un retour arrière réel a été testé.
- **Dépendances :** T-CI-FIRST-RUN, T-OTP-PROVIDERS (pour un service utilisable).
- **Risque résiduel / contournement sûr :** rester sur l'environnement de développement / mock ; ne rien exposer publiquement tant que les secrets ne sont pas générés.
- **Responsable ou agent de suivi :** exploitant SIREN + agent `devsecops` (`.claude/agents/devsecops.md`).

---

### `T-CI-FIRST-RUN — Première exécution de la CI sur GitHub`

- **Priorité :** P1
- **Statut :** PARTIELLE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice A1
- **Résultat attendu :** les 6 jobs de `ci.yml` verts sur GitHub Actions.
- **Ce qui manque exactement :** un push du travail (non autorisé dans cette session) et l'exécution réelle sur les exécuteurs GitHub.
- **Raison concrète du blocage/non-achèvement :** consigne : ne rien commiter ni pousser sans demande explicite.
- **Actions déjà réalisées :** actionlint propre ; actions épinglées par SHA de commit ; chaque étape rejouée localement avec succès (lint 0 erreur, tsc, i18n, jest 238 tests, `expo export` Android, pytest 237, PostGIS + 38 tests, `rebuild-schema.sh` reproductible avec l'image épinglée de la CI, `docker compose config` + `check_compose.py`, gitleaks historique + répertoire, `npm audit --audit-level=critical`). La revue a révélé que le contrôle « schéma reproductible » aurait échoué (image `15-3.4` mutable en local, digest en CI : sortie de `pg_dump` différente) : corrigé.
- **Logique métier déjà implémentée :** sans objet.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** `workflow_call` (réutilisée par `cd.yml`).
- **Fichiers concernés :** `.github/workflows/ci.yml`, `deploy/contabo/check_compose.py`.
- **Tests exécutés et résultats réels :** voir ci-dessus (local).
- **Tests impossibles à exécuter et raison :** cache GHA, services Docker des exécuteurs GitHub — nécessitent un push.
- **Informations non sensibles à fournir :** autorisation de pousser une branche.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** aucun pour la CI (le jeton `GITHUB_TOKEN` intégré suffit).
- **Matériel, firmware, OS ou service tiers requis :** GitHub Actions.
- **Étapes exactes pour reprendre :**
  1. Commiter sur une branche, pousser, ouvrir une pull request.
  2. Corriger un éventuel écart d'environnement (temps de démarrage PostGIS, quotas).
- **Critères d'acceptation de sortie :** 6 jobs verts sur la PR.
- **Dépendances :** aucune.
- **Risque résiduel / contournement sûr :** la CI locale (`docker compose --profile mobile run --rm mobile-checks` + pytest) reste disponible.
- **Responsable ou agent de suivi :** agent `devsecops`.

---

### `T-OTP-PROVIDERS — Fournisseurs réels SMS, WhatsApp et e-mail`

- **Priorité :** P0
- **Statut :** BLOQUÉE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice C6, E1 (prévenir l'ancien numéro)
- **Résultat attendu :** codes réellement livrés par SMS (Twilio ou Africa's Talking), WhatsApp (Cloud API) et e-mail SMTP.
- **Ce qui manque exactement :** comptes fournisseurs, numéro / Sender ID expéditeur enregistré, modèle WhatsApp « authentication » approuvé, domaine e-mail vérifié (SPF/DKIM/DMARC) ; test d'envoi réel par canal.
- **Raison concrète du blocage/non-achèvement :** aucun identifiant fournisseur fourni ; formats d'API suivis d'après la documentation publique, jamais appelés.
- **Actions déjà réalisées :** adaptateurs `_send_sms` (Twilio, Africa's Talking), `_send_whatsapp`, e-mail ; détection des canaux configurés ; erreurs `channel_unavailable` / `delivery_failed` sans faux envoi ; adaptateur de test (`set_test_sender`) ; textes FR/EN sans lien ; journaux masqués.
- **Logique métier déjà implémentée :** tout le cycle OTP (D-02), choix du canal, e-mail seulement vérifié, notification de l'ancien numéro.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** `OTP_MODE=live`, `SMS_PROVIDER`, `GET /auth/otp/channels`, `OtpMessage`, `DeliveryUnavailable`/`DeliveryFailed`.
- **Fichiers concernés :** `server/app/services/otp_delivery.py`, `otp.py`, `security_notifications.py`, `server/.env.example`, `deploy/contabo/env.prod.example`.
- **Tests exécutés et résultats réels :** `test_canal_non_configure_jamais_simule`, `test_changement_de_numero_fournisseur_indisponible`, `test_no_channel_is_claimed_without_provider` : OK.
- **Tests impossibles à exécuter et raison :** envoi réel, accusés de livraison, délais réseau camerounais — aucun compte.
- **Informations non sensibles à fournir :** fournisseur SMS retenu, Sender ID souhaité, numéro WhatsApp Business, nom du modèle approuvé, langue(s) du modèle, domaine expéditeur e-mail, volumes OTP/jour estimés.
- **Accès ou secrets requis (noms des variables/secrets seulement) :**
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` **ou** `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY`, `AFRICASTALKING_SENDER_ID`.
  - `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`.
  - `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`.
  - À placer dans `.env.prod` sur le serveur (mode 600) ou un coffre de secrets, jamais dans Git.
- **Matériel, firmware, OS ou service tiers requis :** téléphones de test sur MTN et Orange Cameroun.
- **Étapes exactes pour reprendre :**
  1. Renseigner les variables d'un canal, `OTP_MODE=live`, redémarrer.
  2. `GET /api/v1/auth/otp/channels` doit lister le canal.
  3. Inscription réelle avec un téléphone de test ; vérifier réception, expiration, renvoi.
- **Critères d'acceptation de sortie :** un code reçu et validé par canal ; un renvoi invalide bien le précédent ; aucune valeur de code dans les journaux.
- **Dépendances :** T-CONTABO-DEPLOY (pour la production), contrat fournisseur.
- **Risque résiduel / contournement sûr :** sans canal, `OTP_MODE` vide ⇒ vérification déclarée non requise (`required:false`) et 2FA impossible à activer ; aucune donnée n'est prétendue vérifiée.
- **Responsable ou agent de suivi :** équipe produit + agent `backend`.

---

### `T-DEV-PIN — Provisionnement des PIN d'activation en fabrication`

- **Priorité :** P0
- **Statut :** BLOQUÉE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice F5 ; protocole (PIN de 6 caractères imprimé sur la boîte)
- **Résultat attendu :** chaque boîtier enregistré avec `activation_pin_hash` (bcrypt), PIN imprimé sur la boîte.
- **Ce qui manque exactement :** procédure de fabrication / import (numéro de série + PIN) et outil d'import des boîtiers en base.
- **Raison concrète du blocage/non-achèvement :** chaîne de fabrication non définie ; aucun lot de boîtiers.
- **Actions déjà réalisées :** colonne `devices.activation_pin_hash` (migration 004) ; vérification serveur, limitation des échecs, réponses différenciées après preuve de possession ; champ PIN dans l'app affiché seulement si `pinRequired`.
- **Logique métier déjà implémentée :** `resolve_device_for_pairing` (D-07).
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** `GET /children/devices/{id}` → `pinRequired` ; mock : boîtiers « neufs » avec PIN de démonstration.
- **Fichiers concernés :** `server/app/api/v1/endpoints/children.py`, `src/app/(main)/add-child.tsx`, `src/api/mock/services/childrenService.ts`.
- **Tests exécutés et résultats réels :** `test_appairage_strict_pin_dissociation_reassociation`, `test_appairage_echecs_limites` : OK.
- **Tests impossibles à exécuter et raison :** boîtier réel avec PIN imprimé.
- **Informations non sensibles à fournir :** format du PIN (alphabet, longueur), emplacement d'impression, fichier d'import attendu.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** aucun nom de variable ; le fichier des PIN est sensible — transfert chiffré, jamais dans Git.
- **Matériel, firmware, OS ou service tiers requis :** lot de boîtiers.
- **Étapes exactes pour reprendre :**
  1. Écrire un script d'import (`device_id`, `secret_key_hash`, `activation_pin_hash` calculés à l'import).
  2. Importer un lot de test ; appairer depuis l'app avec le PIN.
- **Critères d'acceptation de sortie :** appairage impossible sans le PIN pour un boîtier importé.
- **Dépendances :** pôle Dispositif.
- **Risque résiduel / contournement sûr :** sans PIN, un tiers connaissant le numéro d'un boîtier non associé peut l'associer (D-07) ; le propriétaire peut dissocier.
- **Responsable ou agent de suivi :** pôle Dispositif + agent `backend`.

---

### `T-BLE-01 — Transport local téléphone ↔ dispositif`

- **Priorité :** P1
- **Statut :** BLOQUÉE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice H4 (prompt maître §5.H)
- **Résultat attendu :** réception par le téléphone des trames du boîtier hors couverture GPRS, puis relais au serveur.
- **Ce qui manque exactement :** spécification du lien (BLE GATT ou autre : services, caractéristiques, appairage, authentification, chiffrement), firmware correspondant, implémentation native (`react-native-ble-plx` ou équivalent), permissions Android/iOS, branchement de `DeviceLinkSession` dans l'app.
- **Raison concrète du blocage/non-achèvement :** `docs/transition-données-serveur.pdf` ne décrit **aucun** lien direct téléphone ↔ traceur (ESP32 + A9G → MQTT) ; inventer un protocole GATT est exclu (D-09).
- **Actions déjà réalisées :** machine d'états, file persistante bornée (2000, TTL 72 h), idempotence, lots de 100, attente exponentielle avec gigue, refus définitifs écartés, envoi unique concurrent, filtrage du dispositif associé, `SimulatedTransport`, effacement à la déconnexion ; côté serveur `POST /device/v1/relay`.
- **Logique métier déjà implémentée :** `src/features/deviceLink/` ; `relay_frames` (serveur).
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** interface `FrameTransport`, `api.device.relayFrames`, table `device_relay_events`, `positions.source`.
- **Fichiers concernés :** `src/features/deviceLink/*`, `server/app/api/v1/endpoints/device_ingestion.py`.
- **Tests exécutés et résultats réels :** `deviceLink.test.ts` (12 tests) et `test_relais_par_telephone_autorise_et_idempotent` : OK.
- **Tests impossibles à exécuter et raison :** radio réelle, arrière-plan iOS/Android, consommation batterie — aucun matériel ni protocole.
- **Informations non sensibles à fournir :** documentation du lien local, version du firmware, capacités de relais, mécanisme d'authentification du boîtier.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** éventuelles clés de dispositif (processus sécurisé à définir).
- **Matériel, firmware, OS ou service tiers requis :** boîtiers avec firmware BLE, téléphones Android ≥ 12 et iOS ≥ 16.
- **Étapes exactes pour reprendre :**
  1. Obtenir la spécification du lien.
  2. Implémenter `FrameTransport` natif ; brancher `DeviceLinkSession` + `storageOutbox` à l'écran enfant.
  3. Tests sur appareils réels, coupures et redémarrages.
- **Critères d'acceptation de sortie :** trames reçues hors réseau, relayées une seule fois au retour du réseau, visibles uniquement par les comptes autorisés.
- **Dépendances :** T-DEV-FRAME-SIG (pour autoriser des relais tiers).
- **Risque résiduel / contournement sûr :** le traceur garde 2000 positions et dispose de canaux HTTP/SMS de secours (protocole §5).
- **Responsable ou agent de suivi :** pôle Dispositif + agent `ble-mobile`.

---

### `T-DEV-MQTT — Canal MQTT (trames montantes et commandes descendantes)`

- **Priorité :** P1
- **Statut :** BLOQUÉE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice H1 ; protocole §6–§8
- **Résultat attendu :** abonnement `faucon/+/raw`, `faucon/+/data`, `faucon/+/ack` ; publication des commandes signées sur `faucon/<id>/cmd` (QoS 1, TLS 8883).
- **Ce qui manque exactement :** client MQTT serveur (abonné + éditeur), broker et identifiants par traceur, ACL, valeur `mqtt` effective de `DEVICE_COMMAND_CHANNEL`.
- **Raison concrète du blocage/non-achèvement :** aucun broker ni identifiant fourni.
- **Actions déjà réalisées :** analyse et validation des trames, codes d'événement, signature/vérification HMAC, cycle PENDING → SUCCESS/FAILED/TIMEOUT, webhook HTTP de secours `POST /device/v1/frame`, accusé `POST /device/v1/ack`, expiration planifiée, `/position/fix` → LOCALISER (FAILED `no_channel` sans canal).
- **Logique métier déjà implémentée :** `device_protocol.py`, `services/device_commands.py`, `ingest_points` commun.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** `set_test_publisher`, `DEVICE_COMMAND_CHANNEL`, `DEVICE_COMMAND_SIGNING_KEY`, `DEVICE_COMMAND_TIMEOUT_S`, tâche `commands`.
- **Fichiers concernés :** `server/app/services/device_commands.py`, `device_protocol.py`, `api/v1/endpoints/device_ingestion.py`, `device_commands.py`.
- **Tests exécutés et résultats réels :** `test_device_protocol.py`, `test_commande_signee_accuse_et_expiration`, `test_commande_sans_canal_echoue_immediatement`, `test_trame_http_validee_dedoublonnee_et_evenement` : OK.
- **Tests impossibles à exécuter et raison :** broker réel, firmware réel.
- **Informations non sensibles à fournir :** hôte et port du broker, schéma des identifiants par traceur, préfixe de topic définitif (`faucon/` ou `siren/`).
- **Accès ou secrets requis (noms des variables/secrets seulement) :** `DEVICE_COMMAND_SIGNING_KEY` (clé partagée firmware) ; identifiants broker (variables à créer, ex. `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`).
- **Matériel, firmware, OS ou service tiers requis :** broker MQTT (ex. Mosquitto sur le VPS, non publié sans TLS), traceur.
- **Étapes exactes pour reprendre :**
  1. Ajouter un service `mqtt-bridge` (abonné → `ingest_frame`, `apply_ack`) et l'éditeur dans `create_and_dispatch`.
  2. Rendre `channel_available()` vrai quand le broker est joignable.
- **Critères d'acceptation de sortie :** « Localiser maintenant » → SUCCESS par accusé réel et position fraîche reçue.
- **Dépendances :** T-DEV-ACK-FORMAT.
- **Risque résiduel / contournement sûr :** clé de signature unique pour tous les traceurs (protocole) : sa fuite permet de commander tout boîtier — envisager une clé dérivée par traceur.
- **Responsable ou agent de suivi :** pôle Dispositif + agent `backend`.

---

### `T-DEV-ACK-FORMAT — Format exact de la chaîne signée des accusés`

- **Priorité :** P2
- **Statut :** PARTIELLE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** protocole §7.4
- **Résultat attendu :** signature serveur identique à celle du firmware.
- **Ce qui manque exactement :** confirmation que `ok` est sérialisé `true`/`false` (et non `1`/`0`) dans `ok|detail` ; **liaison de la signature à la commande** (revue indépendante) : la chaîne signée `ok|detail` ne contient ni l'identifiant de commande ni le traceur, et la clé est commune à tous les traceurs — un accusé capturé peut être rejoué pour une autre commande du même code. À faire évoluer côté firmware : signer `id|trackerId|cmd|ok|detail`, clé par dispositif.
- **Raison concrète du blocage/non-achèvement :** le document ne précise pas la sérialisation.
- **Actions déjà réalisées :** hypothèse isolée dans `ack_signing_input` et testée.
- **Logique métier déjà implémentée :** `verify_ack`.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** —
- **Fichiers concernés :** `server/app/services/device_protocol.py`.
- **Tests exécutés et résultats réels :** `test_ack_signature_is_verified` : OK (avec l'hypothèse).
- **Tests impossibles à exécuter et raison :** accusé réel du firmware.
- **Informations non sensibles à fournir :** extrait de `publierAck()` du firmware.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** —
- **Matériel, firmware, OS ou service tiers requis :** firmware `faucon_v12.ino`.
- **Étapes exactes pour reprendre :**
  1. Comparer avec le firmware ; ajuster `ack_signing_input` et le test.
- **Critères d'acceptation de sortie :** un accusé réel est accepté.
- **Dépendances :** —
- **Risque résiduel / contournement sûr :** en cas d'écart, les accusés réels seraient refusés (401) et les commandes finiraient en TIMEOUT — jamais acceptées à tort. Rejeu d'accusé : il ne peut marquer SUCCESS qu'une commande EN ATTENTE du même code sur le même traceur (contrôles `device_id`/`code`) ; identifiant non UUID → 404 (plus de 500).
- **Responsable ou agent de suivi :** agent `backend`.

---

### `T-DEV-FRAME-SIG — Authenticité des trames relayées`

- **Priorité :** P2
- **Statut :** BLOQUÉE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice H2 (« les relais ne doivent ni lire ni falsifier »)
- **Résultat attendu :** trame signée (et idéalement chiffrée) par le boîtier, vérifiable par le serveur, opaque pour le relais.
- **Ce qui manque exactement :** champ de signature / format chiffré dans le protocole et clé par boîtier.
- **Raison concrète du blocage/non-achèvement :** le protocole (§7.1) n'en prévoit pas ; aucun chiffrement fictif n'est ajouté.
- **Actions déjà réalisées :** relais restreint aux comptes autorisés, positions marquées `source=relay`, idempotence (D-08).
- **Logique métier déjà implémentée :** `relay_frames`.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** `positions.source` (migration 005).
- **Fichiers concernés :** `server/app/api/v1/endpoints/device_ingestion.py`, `src/features/deviceLink/outbox.ts`.
- **Tests exécutés et résultats réels :** relais refusé à un compte étranger : OK.
- **Tests impossibles à exécuter et raison :** aucun format signé.
- **Informations non sensibles à fournir :** décision du pôle Dispositif sur la signature des trames.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** clés par dispositif (processus de provisionnement à définir).
- **Matériel, firmware, OS ou service tiers requis :** firmware.
- **Étapes exactes pour reprendre :**
  1. Ajouter un 13e champ `mac` (HMAC par boîtier) au protocole ; le vérifier dans `parse_frame`.
- **Critères d'acceptation de sortie :** trame modifiée par un relais refusée.
- **Dépendances :** T-BLE-01, T-DEV-PIN (provisionnement des clés).
- **Risque résiduel / contournement sûr :** un compte autorisé peut injecter des positions de son propre enfant ; file locale non chiffrée au repos (bac à sable de l'app, 72 h, effacée à la déconnexion).
- **Responsable ou agent de suivi :** pôle Dispositif.

---

### `T-UI-VISUAL — Validation visuelle sur appareils réels`

- **Priorité :** P1
- **Statut :** PARTIELLE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice G1, F2, I1, D3
- **Résultat attendu :** écran d'urgence, saisie du numéro de série, carte et complétion du téléphone vérifiés sur petits et grands écrans, polices agrandies, clavier, Android et iOS.
- **Ce qui manque exactement :** captures et contrôle manuel sur au moins un petit Android (≤ 5,5″), un grand Android, un iPhone, police système à 200 %, lecteur d'écran (TalkBack/VoiceOver) ; comportement du curseur du `SerialInput` sur claviers Gboard/SwiftKey/iOS.
- **Raison concrète du blocage/non-achèvement :** aucun appareil ni émulateur piloté dans cette session ; **aucune validation visuelle n'est revendiquée**.
- **Actions déjà réalisées :** barre d'appels fixe hors défilement, marges, carte non interactive, libellés de boutons sur plusieurs lignes, raisons traduites ; tests RNTL de structure ; fonctions pures testées (curseur, collage).
- **Logique métier déjà implémentée :** `nextSerialInput`, `permissionStateFrom`.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** mode mock (`EXPO_PUBLIC_API_MODE=mock`) : boîtier neuf au bon format avec PIN de démonstration.
- **Fichiers concernés :** `src/app/(emergency)/urgence.tsx`, `src/components/SerialInput.tsx`, `src/features/children/tabs/MapTab.tsx`, `src/app/(main)/settings/phone.tsx`.
- **Tests exécutés et résultats réels :** `critical.test.tsx` (6 tests), `serial.test.ts` (8), `phoneLocation.test.ts` : OK.
- **Tests impossibles à exécuter et raison :** rendu natif réel.
- **Informations non sensibles à fournir :** liste des appareils cibles du pilote.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** —
- **Matériel, firmware, OS ou service tiers requis :** téléphones de test.
- **Étapes exactes pour reprendre :**
  1. `npm run build:apk:debug`, installer ; parcours : inscription, appairage manuel, carte (autoriser / refuser / refuser définitivement / localisation coupée), alerte (mode mock, scénario d'urgence).
  2. Joindre captures et anomalies à ce registre.
- **Critères d'acceptation de sortie :** boutons d'appel visibles sans défilement sur tous les appareils et à 200 % ; aucun saut de curseur.
- **Dépendances :** —
- **Risque résiduel / contournement sûr :** les appels vitaux sont structurellement hors défilement (testé).
- **Responsable ou agent de suivi :** agent `qa-security` + testeur humain.

---

### `T-BACKUP-OFFSITE — Chiffrement et copie hors site des sauvegardes`

- **Priorité :** P1
- **Statut :** PARTIELLE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice A4
- **Résultat attendu :** sauvegardes chiffrées (`age`) copiées hors du VPS (`rclone`), testées chaque semaine.
- **Ce qui manque exactement :** paire de clés `age` (clé privée conservée hors serveur), stockage objet hors site, exécution réelle ; **test de restauration hebdomadaire des sauvegardes chiffrées hors serveur** (le cron du serveur échoue volontairement sans `AGE_IDENTITY` : la clé privée n'y est pas) ; règle de cycle de vie du stockage pour la rétention distante (`rclone copy` ne supprime rien à distance).
- **Raison concrète du blocage/non-achèvement :** aucun stockage ni clé fournis ; `age`/`rclone` absents du poste de test.
- **Actions déjà réalisées :** `backup.sh` (dump custom, vérification de format **et lecture complète par `pg_restore --list` avant chiffrement**, empreinte SHA-256 relative, rétention 7/4/6/5, chiffrement et copie optionnels, aucun fichier partiel laissé en cas d'échec), `restore.sh` (empreinte **exigée**, clé `age` vérifiée, déchiffrement et lecture complète **avant** toute suppression de la cible, cible de contrôle, refus de la prod sans confirmation), `verify-restore.sh` (comparaison du nombre de comptes avec la source, base de contrôle supprimée même en échec), cron dans `install.sh`.
- **Logique métier déjà implémentée :** sans objet.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** `BACKUP_DIR`, `BACKUP_AGE_RECIPIENT`, `BACKUP_RCLONE_REMOTE`, `AGE_IDENTITY`, `PRODUCTION_RESTORE`.
- **Fichiers concernés :** `deploy/contabo/backup.sh`, `restore.sh`, `verify-restore.sh`, `install.sh`.
- **Tests exécutés et résultats réels :** sauvegarde/rétention/restauration/vérification OK sur la base de dev et sur la pile répétée ; refus prod OK ; fichier altéré détecté ; après revue : empreinte absente, fichier tronqué et fichier chiffré sans clé refusés **sans toucher à la base cible** ; sauvegarde en échec sans aucun fichier restant.
- **Tests impossibles à exécuter et raison :** chiffrement `age` et copie `rclone` (outils et stockage absents).
- **Informations non sensibles à fournir :** fournisseur de stockage hors site, région, durée de conservation légale.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** `BACKUP_AGE_RECIPIENT` (clé publique, non secrète) ; configuration `rclone` (identifiants du stockage, sur le serveur uniquement).
- **Matériel, firmware, OS ou service tiers requis :** stockage objet compatible S3.
- **Étapes exactes pour reprendre :**
  1. `age-keygen` sur un poste hors serveur ; reporter la clé publique dans `.env.prod`.
  2. Configurer le remote `rclone` ; lancer `backup.sh daily` puis `verify-restore.sh` avec `AGE_IDENTITY`.
- **Critères d'acceptation de sortie :** une restauration réussie depuis la copie hors site, sur une autre machine.
- **Dépendances :** T-CONTABO-DEPLOY.
- **Risque résiduel / contournement sûr :** sauvegardes locales en clair limitées au propriétaire (600) ; perte du VPS = perte des sauvegardes tant que la copie hors site manque.
- **Responsable ou agent de suivi :** agent `devsecops`.

---

### `T-DEPS-EXPO — Vulnérabilités de la chaîne Expo / React Native / Jest`

- **Priorité :** P1
- **Statut :** PARTIELLE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice J3
- **Résultat attendu :** `npm audit --omit=dev` sans vulnérabilité élevée.
- **Ce qui manque exactement :** montée de version majeure du SDK Expo (et de React Native, Jest) ; 47 « high » et 18 « moderate » restantes, essentiellement dans l'outillage de build (metro, @expo/cli, jest).
- **Raison concrète du blocage/non-achèvement :** correctifs disponibles seulement via `npm audit fix --force` (changement majeur, régression probable sur les modules natifs) — non appliqué sans campagne de test sur appareil.
- **Actions déjà réalisées :** `npm audit fix` compatible appliqué (axios 1.20.0, plus aucune vulnérabilité critique) ; CI bloquante sur « critique », rapport complet publié.
- **Logique métier déjà implémentée :** —
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** —
- **Fichiers concernés :** `package.json`, `package-lock.json`, `.github/workflows/ci.yml`.
- **Tests exécutés et résultats réels :** après correctif : lint, tsc, jest 236, `expo export` OK.
- **Tests impossibles à exécuter et raison :** montée de SDK non tentée.
- **Informations non sensibles à fournir :** calendrier de mise à jour du SDK.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** —
- **Matériel, firmware, OS ou service tiers requis :** appareils de test (modules natifs MapLibre, caméra, notifications).
- **Étapes exactes pour reprendre :**
  1. `npx expo install --fix` vers le SDK suivant ; rejouer CI + parcours T-UI-VISUAL.
- **Critères d'acceptation de sortie :** 0 « high » en dépendances de production.
- **Dépendances :** T-UI-VISUAL.
- **Risque résiduel / contournement sûr :** la plupart des paquets concernés ne sont pas embarqués dans l'APK (outillage de développement).
- **Responsable ou agent de suivi :** agent `ble-mobile`.

---

### `T-PY-JOSE — Remplacement de python-jose`

- **Priorité :** P2
- **Statut :** PARTIELLE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice J3
- **Résultat attendu :** `pip-audit` sans vulnérabilité sur les dépendances d'exécution.
- **Ce qui manque exactement :** python-jose 3.5.0 (dernière version) reste signalée sans correctif ; `ecdsa` (dépendance) aussi ; `pytest` 8.3.2 (outil de test) à monter en 9.0.3.
- **Raison concrète du blocage/non-achèvement :** remplacement par PyJWT = changement de code de `core/security.py` à mener avec sa propre série de tests.
- **Actions déjà réalisées :** fastapi 0.115.0 → 0.156.8 (starlette 1.9.0), python-multipart → 0.0.32, python-jose → 3.5.0 ; 227 tests + 29 tests d'intégration OK ; image Docker reconstruite et `/health` vérifié.
- **Logique métier déjà implémentée :** JWT HS256 uniquement (la partie `ecdsa` n'est pas utilisée).
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** `create_access_token`, `create_mfa_token`, `decode_token`.
- **Fichiers concernés :** `server/app/core/security.py`, `server/requirements*.txt`.
- **Tests exécutés et résultats réels :** `pip-audit` : restent python-jose, ecdsa (sans correctif), pytest.
- **Tests impossibles à exécuter et raison :** —
- **Informations non sensibles à fournir :** —
- **Accès ou secrets requis (noms des variables/secrets seulement) :** —
- **Matériel, firmware, OS ou service tiers requis :** —
- **Étapes exactes pour reprendre :**
  1. Remplacer `jose.jwt` par `jwt` (PyJWT) en conservant `algorithms=["HS256"]` ; rejouer la suite.
- **Critères d'acceptation de sortie :** `pip-audit` propre hors outils de test.
- **Dépendances :** —
- **Risque résiduel / contournement sûr :** algorithme imposé côté décodage (HS256), secrets ≥ 32 caractères exigés hors développement.
- **Responsable ou agent de suivi :** agent `backend`.

---

### `T-DB-PHONE-NOTNULL — Téléphone NOT NULL après migration des comptes`

- **Priorité :** P2
- **Statut :** NON COMMENCÉE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** matrice D3 (prompt §5.D : NOT NULL seulement après un chemin de migration)
- **Résultat attendu :** `users.telephone NOT NULL` et contrainte E.164 validée.
- **Ce qui manque exactement :** constat qu'aucun compte actif n'a `telephone IS NULL`, puis migration `00N`.
- **Raison concrète du blocage/non-achèvement :** dépend de la complétion par les utilisateurs existants (D-04).
- **Actions déjà réalisées :** trigger à l'insertion, `phoneRequired`, parcours de complétion.
- **Logique métier déjà implémentée :** `require_user_telephone()`.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** migration 004.
- **Fichiers concernés :** `server/migrations/004_*.sql`.
- **Tests exécutés et résultats réels :** insertion sans téléphone refusée : OK.
- **Tests impossibles à exécuter et raison :** données de production.
- **Informations non sensibles à fournir :** nombre de comptes existants sans téléphone.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** —
- **Matériel, firmware, OS ou service tiers requis :** —
- **Étapes exactes pour reprendre :**
  1. `SELECT count(*) FROM users WHERE telephone IS NULL AND deleted_at IS NULL;` → 0.
  2. Migration : `VALIDATE CONSTRAINT ck_users_telephone_e164` puis `ALTER COLUMN telephone SET NOT NULL` (comptes supprimés exclus via politique de rétention).
- **Critères d'acceptation de sortie :** migration appliquée sans erreur.
- **Dépendances :** T-OTP-PROVIDERS.
- **Risque résiduel / contournement sûr :** —
- **Responsable ou agent de suivi :** agent `backend`.

---

### `T-DB-RLS — Politiques RLS par famille`

- **Priorité :** P3
- **Statut :** NON COMMENCÉE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** défense en profondeur (D-11)
- **Résultat attendu :** politiques RLS par compte/enfant ; retrait de `BYPASSRLS` du rôle applicatif.
- **Ce qui manque exactement :** passage de l'identité du compte à la session SQL (`SET LOCAL`) et politiques par table.
- **Raison concrète du blocage/non-achèvement :** refonte transverse hors du périmètre de finalisation ; l'autorisation applicative est testée.
- **Actions déjà réalisées :** rôle sans DDL ; RLS déjà activée sur les tables.
- **Logique métier déjà implémentée :** `app/core/authz.py`.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** —
- **Fichiers concernés :** `deploy/contabo/sql/app_role.sql`.
- **Tests exécutés et résultats réels :** —
- **Tests impossibles à exécuter et raison :** —
- **Informations non sensibles à fournir :** —
- **Accès ou secrets requis (noms des variables/secrets seulement) :** —
- **Matériel, firmware, OS ou service tiers requis :** —
- **Étapes exactes pour reprendre :**
  1. Concevoir les politiques, `SET LOCAL app.user_id` dans `get_db`, tests d'intégration croisés.
- **Critères d'acceptation de sortie :** tests d'intégration verts sans `BYPASSRLS`.
- **Dépendances :** —
- **Risque résiduel / contournement sûr :** une faille d'autorisation dans l'API ne serait pas rattrapée par la base.
- **Responsable ou agent de suivi :** agent `backend`.

---

### `T-AUTH-RESIDUAL — Résidus de la revue de sécurité (authentification)`

- **Priorité :** P2
- **Statut :** PARTIELLE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** prompt maître §5.C (pas d'énumération, limites de débit), revue `qa-security` du 2026-10-21
- **Résultat attendu :** aucun signal d'existence de compte, plafonds OTP strictement respectés en concurrence, aucun numéro réservé sans preuve.
- **Ce qui manque exactement :** (1) temps de réponse de `POST /auth/forgot` : seul un compte existant déclenche l'appel au fournisseur (la réponse est uniforme, la durée non) — envoi à placer en tâche de fond ; (2) plafonds OTP « compter puis insérer » sans verrou : des requêtes parallèles peuvent dépasser le plafond de quelques unités — verrou consultatif par destination ; (3) un numéro inscrit mais jamais vérifié réserve l'unicité indéfiniment — libération après délai ou prise de possession par vérification.
- **Raison concrète du blocage/non-achèvement :** (1) et (2) demandent un mécanisme de tâche de fond / verrou testé sur Postgres réel avec fournisseur simulé lent ; (3) est une règle produit à valider (délai, information de l'ancien titulaire).
- **Actions déjà réalisées :** constats majeurs corrigés et testés (renvoi 2FA d'un challenge caduc, numéro « vérifié » par e-mail, limite PIN réinitialisable, verrouillage contournable par le format du numéro, inscription en 409 non comptée, 502/503 révélateurs du mot de passe oublié).
- **Logique métier déjà implémentée :** `canonical_identifier`, `find_live_challenge`, `invalidate_pending`, `PHONE_PROOF_PURPOSES`, compteur `pair_fail_device`.
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** `otp_delivery.set_test_sender` (fournisseur simulé, y compris en échec).
- **Fichiers concernés :** `server/app/api/v1/endpoints/auth.py`, `server/app/services/otp.py`.
- **Tests exécutés et résultats réels :** 9 tests PostGIS ajoutés (`test_database_v2.py`, section « Constats de la revue indépendante ») : OK.
- **Tests impossibles à exécuter et raison :** mesure de temps réaliste avec un vrai fournisseur (T-OTP-PROVIDERS).
- **Informations non sensibles à fournir :** délai de libération d'un numéro non vérifié.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** —
- **Matériel, firmware, OS ou service tiers requis :** —
- **Étapes exactes pour reprendre :**
  1. Envoi asynchrone du code de récupération (Celery) avec réponse immédiate uniforme.
  2. `pg_advisory_xact_lock` sur l'empreinte de destination dans `_ensure_send_allowed`, test concurrent.
  3. Décider la règle de libération, migration additive si besoin.
- **Critères d'acceptation de sortie :** tests de concurrence et de temps verts.
- **Dépendances :** T-OTP-PROVIDERS.
- **Risque résiduel / contournement sûr :** énumération par le temps limitée par `forgot_ip` ; dépassement de plafond borné à quelques codes.
- **Responsable ou agent de suivi :** agent `backend`.

---

### `T-WS-TOKEN — Jeton d'accès dans l'URL du WebSocket`

- **Priorité :** P2
- **Statut :** PARTIELLE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** prompt maître §5.J, revue `devsecops` du 2026-10-21
- **Résultat attendu :** aucun jeton dans une URL.
- **Ce qui manque exactement :** authentification par premier message (ou sous-protocole) au lieu de `GET /api/v1/ws?token=…`, côté serveur et app.
- **Raison concrète du blocage/non-achèvement :** changement de contrat app ↔ serveur ; le risque principal (journaux) est déjà traité.
- **Actions déjà réalisées :** paramètre `token` retiré des journaux d'accès ET d'erreur de Caddy (vérifié : 0 occurrence) ; Gunicorn sans journal d'accès.
- **Logique métier déjà implémentée :** —
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** —
- **Fichiers concernés :** `deploy/contabo/Caddyfile.prod`, `server/app/api/v1/endpoints/websocket.py`, `src/api/live/`.
- **Tests exécutés et résultats réels :** requête `?token=` sur Caddy épinglé : jeton absent des journaux.
- **Tests impossibles à exécuter et raison :** —
- **Informations non sensibles à fournir :** —
- **Accès ou secrets requis (noms des variables/secrets seulement) :** —
- **Matériel, firmware, OS ou service tiers requis :** —
- **Étapes exactes pour reprendre :**
  1. Message `{"type":"auth","token":…}` accepté dans les 5 s, sinon fermeture ; mise à jour du client et des tests.
- **Critères d'acceptation de sortie :** plus aucune URL contenant un jeton.
- **Dépendances :** —
- **Risque résiduel / contournement sûr :** jeton d'accès de courte durée ; journaux filtrés.
- **Responsable ou agent de suivi :** agents `backend` et `ble-mobile`.

---

### `T-OPS-ALERTING — Alertes d'exploitation`

- **Priorité :** P1
- **Statut :** NON COMMENCÉE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** prompt maître §5.A (sauvegardes, test de restauration), revue `devsecops`
- **Résultat attendu :** un échec de sauvegarde, de test de restauration ou de santé prévient l'exploitant.
- **Ce qui manque exactement :** canal d'alerte (e-mail, webhook) et branchement des tâches cron ; surveillance externe de `/health/ready`.
- **Raison concrète du blocage/non-achèvement :** canal non choisi.
- **Actions déjà réalisées :** chaque script échoue avec un code non nul et un message explicite (journal `/var/log/siren-backup.log`).
- **Logique métier déjà implémentée :** —
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** `/health/ready`.
- **Fichiers concernés :** `deploy/contabo/install.sh`.
- **Tests exécutés et résultats réels :** —
- **Tests impossibles à exécuter et raison :** aucun canal configuré.
- **Informations non sensibles à fournir :** adresse ou service d'alerte retenu.
- **Accès ou secrets requis (noms des variables/secrets seulement) :** `ALERT_WEBHOOK_URL` (à créer).
- **Matériel, firmware, OS ou service tiers requis :** service de supervision externe (facultatif).
- **Étapes exactes pour reprendre :**
  1. Envelopper les lignes cron (`|| notify`), ajouter une sonde externe.
- **Critères d'acceptation de sortie :** une panne simulée produit une alerte reçue.
- **Dépendances :** T-CONTABO-DEPLOY.
- **Risque résiduel / contournement sûr :** lecture régulière du journal des sauvegardes (checklist §9).
- **Responsable ou agent de suivi :** agent `devsecops`.

---

### `T-DEPS-PIN — Image de base Python non épinglée`

- **Priorité :** P2
- **Statut :** NON COMMENCÉE
- **Date de vérification :** `2026-10-21`
- **Exigence d'origine :** prompt maître §5.J (chaîne d'approvisionnement)
- **Résultat attendu :** `server/Dockerfile` et `Dockerfile.worker` basés sur `python:3.12-slim@sha256:…`, mis à jour par un outil (Dependabot/Renovate).
- **Ce qui manque exactement :** épinglage et outil de mise à jour.
- **Raison concrète du blocage/non-achèvement :** sans outil de mise à jour, un digest figé priverait des correctifs de sécurité de l'image ; choix à faire avec l'activation de la CI.
- **Actions déjà réalisées :** images tierces de la pile (PostGIS, Redis, Caddy, gitleaks) et actions GitHub épinglées.
- **Logique métier déjà implémentée :** —
- **Interfaces, contrats, migrations, adaptateurs, mocks/simulateurs et flags disponibles :** —
- **Fichiers concernés :** `server/Dockerfile`, `server/Dockerfile.worker`.
- **Tests exécutés et résultats réels :** —
- **Tests impossibles à exécuter et raison :** —
- **Informations non sensibles à fournir :** —
- **Accès ou secrets requis (noms des variables/secrets seulement) :** —
- **Matériel, firmware, OS ou service tiers requis :** Dependabot ou Renovate sur le dépôt GitHub.
- **Étapes exactes pour reprendre :**
  1. Épingler le digest, activer `docker` dans `.github/dependabot.yml`.
- **Critères d'acceptation de sortie :** images reproductibles, mises à jour proposées automatiquement.
- **Dépendances :** T-CI-FIRST-RUN.
- **Risque résiduel / contournement sûr :** construction reproductible au tag près (provenance + SBOM publiés par la CD).
- **Responsable ou agent de suivi :** agent `devsecops`.

---

## Checklist d'informations et d'accès à recueillir

Cocher uniquement quand c'est réellement disponible et vérifié. Ne pas coller les valeurs secrètes ici.

- [x] Stack et commandes de build/test confirmées par le dépôt.
- [x] URL du dépôt distant et fournisseur CI/CD identifié (GitHub, GitHub Actions).
- [ ] Secrets CI/CD créés dans le gestionnaire de secrets approprié.
- [ ] Accès administrateur VPS Contabo fourni par un canal sécurisé, avec compte non-root lorsque possible.
- [ ] Domaine, DNS et stratégie de certificats TLS confirmés (stratégie prévue : Let's Encrypt via Caddy).
- [ ] Ressources VPS disponibles (CPU, RAM, stockage, OS, sauvegardes).
- [ ] Accès et paramètres de l'expéditeur SMS / fournisseur SMS, sans secret stocké dans Git.
- [ ] Accès WhatsApp Business/provider, numéro expéditeur et modèles approuvés, si requis.
- [ ] Configuration e-mail (SMTP/API, domaine expéditeur et vérification SPF/DKIM/DMARC si applicable), si requise.
- [ ] Appareils physiques de test, versions Android/iOS et permissions BLE/localisation disponibles.
- [ ] Version du firmware BLE, documentation du protocole, mécanisme d'authentification/chiffrement et capacités de relais confirmés.
- [ ] Clés/certificats de dispositif disponibles via un processus sécurisé, si le protocole les requiert.
- [ ] Fournisseur cartographique, restrictions et clé API éventuelle identifiés.
- [ ] Données de test anonymisées et stratégie de migration des comptes existants validées.
- [ ] Volumes prévisionnels (utilisateurs, OTP/jour, événements BLE, rétention des données, sauvegardes) estimés pour le cahier des coûts.
- [ ] Fenêtre de déploiement et personne autorisée à valider le passage en production identifiées.

## Journal de reprise

| Date | Tâche | Changement effectué | Tests relancés | Résultat | Décision |
|---|---|---|---|---|---|
| `2026-10-21` | T-CONTABO-DEPLOY | Répétition locale : correction du routage Caddy (`handle`), du retour arrière interrompu par `set -e`, du `pull` bloquant de `rollback.sh` et de son URL de santé | 1er déploiement, mise à jour, version cassée, retour manuel, verify-restore | OK | BLOQUER (accès manquants) |
| `2026-10-21` | T-DEPS-EXPO | `npm audit fix` compatible | lint, tsc, jest, `expo export` | OK, 0 critique | CORRIGER (SDK) |
| `2026-10-21` | T-PY-JOSE | fastapi/starlette, python-multipart, python-jose mis à jour ; copie dupliquée retirée de `requirements.txt` | pytest 227 + 29 intégration, image Docker `/health` | OK | CORRIGER (PyJWT) |
| `2026-10-21` | Revue `qa-security` | 4 majeurs + 5 mineurs serveur corrigés (renvoi 2FA caduc, preuve du numéro par e-mail, limite PIN, clé de verrouillage normalisée, 409 compté, oubli uniforme, relais soumis à `position_precise`, empreinte libérée, accusé non UUID) ; parcours app bloquants (déconnexion sur l'écran imposé, session conservée si l'envoi échoue, autre canal 2FA) ; `OTP_MODE` vide et `OTP_LENGTH≠6` refusés en production | pytest 237, PostGIS 38, jest 238, lint, tsc, i18n | OK | ACCEPTER (résidus T-AUTH-RESIDUAL) |
| `2026-10-21` | Revue `devsecops` | secrets du propriétaire hors des conteneurs applicatifs, proxy limité, jeton WS hors journaux, CD depuis un tag sans réécriture d'image, version inscrite après succès, verrou, restauration sans suppression préalable, sauvegarde vérifiée avant chiffrement, schéma reproductible (digest), `/health/ready`, `TRUST_PROXY_HEADERS` désactivé par défaut, `authorized_keys` non écrasé, HTTP/3 coupé | répétition locale complète ×2, shellcheck, actionlint, `check_compose.py`, `caddy validate`, gitleaks | OK | BLOQUER (accès), T-OPS-ALERTING, T-WS-TOKEN, T-DEPS-PIN |
