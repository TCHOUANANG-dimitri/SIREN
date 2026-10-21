# Plan de tests et de sécurité — SIREN

Dernière exécution : **2026-10-21** (poste de développement, Docker local). « Exécuté » signifie lancé dans cette session avec le résultat indiqué ; « non exécuté » est toujours accompagné de la raison.

## 1. Commandes

| Suite | Commande | Résultat |
|---|---|---|
| Lint app | `npm run lint` | 0 erreur, 10 avertissements (préexistants) |
| Types | `npm run typecheck` | OK |
| Traductions | `npm run i18n:check` | 0 manquante / 0 texte en dur ; 13 clés inutilisées (avertissement, préexistantes) |
| Tests app | `npm test` | 29 suites, 238 tests OK |
| Bundle Android | `npx expo export --platform android` | OK |
| Tests serveur | `cd server && python -m pytest` | 237 OK, 38 ignorés (intégration), 1 xfail documenté (C6) |
| Intégration PostGIS | `SIREN_DB_TESTS=1 DATABASE_URL=… pytest tests/test_database.py tests/test_database_v2.py` | 38 OK — **connecté en `siren_app`** (rôle de production) |
| Migrations | `python migrations/apply.py` (2 passages) + `scripts/db/rebuild-schema.sh` (×2, image épinglée de la CI) | OK, idempotent, sortie identique d'une exécution à l'autre, `schema.sql` = `db_schema.sql` |
| Workflows | `actionlint` 1.7.7 | OK |
| Scripts d'exploitation | `shellcheck` 0.10.0 (`deploy/contabo/*.sh`, `rebuild-schema.sh`) | OK |
| Proxy de production | `caddy validate` (image épinglée) + requête `?token=` | configuration valide ; jeton absent des journaux d'accès et d'erreur |
| Secrets | gitleaks (historique complet + répertoire, image de la CI) | aucun constat ; valeurs factices annotées `gitleaks:allow`, modèles `a-remplacer-…` en liste blanche (`.gitleaks.toml`), un jeton factice d'un ancien commit dans `.gitleaksignore` |
| Dépendances JS | `npm audit --omit=dev` | 0 critique ; 47 high / 18 moderate (chaîne Expo, T-DEPS-EXPO) |
| Dépendances Python | `pip-audit -r requirements.txt` | restent python-jose et ecdsa (sans correctif), pytest (outil de test) — T-PY-JOSE |
| Configuration prod | `docker compose … config` + `check_compose.py` | conforme |
| Répétition de déploiement | `deploy.sh` / `rollback.sh` / `backup.sh` / `restore.sh` / `verify-restore.sh` sur Docker local, avant et après la revue | OK (`docs/DEPLOIEMENT_CONTABO.md` §8) |

## 2. Tests de sécurité ciblés (automatisés)

| Menace | Contrôle | Test |
|---|---|---|
| Réutilisation d'un code | usage unique, verrou de ligne | `test_verification_du_telephone_usage_unique`, `test_double_validation_simultanee_un_seul_succes` |
| Force brute du code | 5 essais puis code grillé | `test_renvoi_invalide_le_code_precedent_et_essais_limites` |
| Ancien code après renvoi | invalidation | idem |
| Code d'un autre usage | usages séparés | `test_usages_separes` ; mock `auth.test.ts` |
| Code d'un autre compte (changement de numéro) | challenge lié au compte | `test_changement_de_numero_code_d_un_autre_compte_refuse` |
| Abus d'envoi (« SMS pumping ») | limites par compte, destination, IP | `test_plafonds_par_destination_et_par_ip` |
| Force brute du mot de passe | limite par compte et IP, même réponse | `test_connexion_par_telephone_et_limitation` |
| Énumération de comptes | réponse uniforme (oubli, connexion), bcrypt factice | `test_mot_de_passe_oublie_par_telephone`, `test_forgot_password_does_not_reveal_unknown_accounts` |
| Jeton MFA utilisé comme session | type `mfa` refusé | `test_login_with_2fa_returns_an_mfa_token_and_no_session` |
| Falsification de l'IP | dernière entrée de `X-Forwarded-For` | `test_client_ip_ignores_spoofable_forwarded_entries` |
| Faux canal « envoyé » | 503 sans fournisseur | `test_canal_non_configure_jamais_simule` |
| Code ou jeton en clair en base | HMAC | `test_verification_du_telephone_usage_unique` |
| Course au numéro | revérification + index unique | `test_changement_de_numero_pris_entre_temps` |
| Appairage d'un boîtier d'autrui | PIN, 404 indistinct, échecs limités | `test_appairage_*` |
| QR malveillant | donnée stricte, aucune URL ouverte | `serial.test.ts` |
| Injection de positions par un tiers | relais réservé aux comptes autorisés | `test_relais_par_telephone_autorise_et_idempotent` |
| Commande / accusé forgé | HMAC, appariement commande ↔ traceur | `test_commande_signee_accuse_et_expiration` |
| Trame invalide | validation (bornes, nombre de champs, horodatage) | `test_device_protocol.py` |
| Secrets d'exemple en production | refus de démarrer / de déployer | `test_production_refuses_*`, `lib.sh` (vérifié à la main) |
| Clickjacking, MIME sniffing, cache | en-têtes | `test_security_headers_on_api_responses` ; répétition |
| DDL par l'application | rôle `siren_app` | vérification manuelle (`CREATE`/`DROP` refusés) + 29 tests en `siren_app` |
| Base exposée | réseau interne, aucun port | `check_compose.py` (CI) ; répétition |
| Fuite de secrets dans Git | gitleaks | job `secrets` |
| Renvoi 2FA d'un challenge consommé / antérieur à un nouveau mot de passe | `find_live_challenge`, `invalidate_pending` | `test_renvoi_2fa_refuse_un_challenge_caduc` |
| Numéro « vérifié » par un code e-mail | usages de preuve du numéro limités à sms / whatsapp, même en dev | `test_telephone_jamais_verifie_par_un_code_e_mail`, `test_issue_refuses_email_for_phone_proof_even_in_dev` |
| Force brute du PIN (compteur remis à zéro, comptes multiples) | aucune remise à zéro, compteur par dispositif | `test_appairage_pin_limite_par_dispositif_et_non_reinitialise` |
| Verrouillage contourné par le format du numéro | clé de limitation normalisée E.164 | `test_verrouillage_de_connexion_independant_du_format_du_numero`, `test_login_limit_key_is_the_canonical_identifier` |
| Énumération par inscription (409 non compté) | essai validé avant le 409 | `test_echecs_d_inscription_comptes_malgre_le_409` |
| Énumération par erreur fournisseur (oubli) | 429/502/503 → réponse uniforme | `test_mot_de_passe_oublie_uniforme_si_le_fournisseur_echoue` |
| Injection de positions par un proche sans droit | relais soumis à `position_precise` | `test_relais_reserve_aux_comptes_voyant_la_position` |
| Accusé avec identifiant arbitraire (500) | identifiant UUID exigé | `test_accuse_avec_identifiant_non_uuid`, `test_command_ids_must_be_uuids` |
| Production sans vérification par code (OTP_MODE vide) | refus de démarrer | `test_server_refuses_default_secrets_outside_development` |
| IP falsifiée sur une API exposée en direct | `TRUST_PROXY_HEADERS` désactivé par défaut | `test_client_ip_ignores_spoofable_forwarded_entries` |
| Mot de passe superutilisateur dans l'API | effacé de l'environnement applicatif | `check_compose.py` (CI) ; répétition (`env` des conteneurs) |
| Restauration destructrice d'une sauvegarde illisible | lecture complète avant `DROP` | répétition (empreinte absente, fichier tronqué, clé absente : base cible intacte) |

## 3. Tests d'interface

`src/components/__tests__/critical.test.tsx` (React Native Testing Library) : appels vitaux hors de la zone défilante, raisons sans code technique, nom long non tronqué, carte sans capture de geste, appel du numéro de secours ; `SerialInput` (préfixe, tiret, casse, collage, caractères refusés).

**Non exécuté :** rendu natif sur appareils réels (tailles d'écran, police à 200 %, TalkBack/VoiceOver, claviers) — aucun appareil disponible (T-UI-VISUAL). Aucune validation visuelle n'est revendiquée.

## 4. Non exécutés (et pourquoi)

| Test | Raison | Tâche |
|---|---|---|
| Envoi réel SMS / WhatsApp / e-mail | aucun compte fournisseur | T-OTP-PROVIDERS |
| CI sur GitHub Actions | aucun push autorisé | T-CI-FIRST-RUN |
| Déploiement Contabo, TLS Let's Encrypt, UFW, SSH durci | aucun VPS ni domaine | T-CONTABO-DEPLOY |
| Chiffrement `age`, copie `rclone` | outils et stockage absents | T-BACKUP-OFFSITE |
| BLE, MQTT, firmware | protocole / broker / matériel absents | T-BLE-01, T-DEV-MQTT |
| Test d'intrusion externe | hors périmètre ; recommandé avant ouverture publique | — |

## 5. Revue indépendante (2026-10-21)

Deux revues en lecture seule, sans accès en écriture, sur l'ensemble du diff : `qa-security` (application et serveur) et `devsecops` (CI/CD, Docker, scripts d'exploitation). Chaque constat a été vérifié dans le code avant correction ; aucun n'était bloquant.

| Revue | Constats | Corrigés et testés | Différés (tâche) |
|---|---|---|---|
| `qa-security` | 4 majeurs, 7 mineurs | 4 majeurs ; mineurs 1 à 4, identifiant d'accusé (5), parcours app bloquants (6), contrainte e-mail en 500 et API exposée (7) | temps de réponse de l'oubli, plafonds OTP en concurrence, numéro non vérifié réservé (T-AUTH-RESIDUAL) ; liaison de la signature d'accusé à la commande (T-DEV-ACK-FORMAT) ; longueur de code dynamique : refus de `OTP_LENGTH≠6` en production à la place |
| `devsecops` | 7 majeurs, 12 mineurs | 7 majeurs (secrets des conteneurs, jeton dans les journaux, CD depuis un tag sans réécriture, version inscrite après succès, restauration non destructive, test de restauration chiffré documenté hors serveur, schéma reproductible) ; mineurs : injection d'expression, mot de passe hors arguments, `/health/ready`, version d'exemple, `env_value`, fichiers partiels, `verify-restore`, verrou, `OTP_MODE` vide, `TRUST_PROXY_HEADERS`, `authorized_keys`, `state/` ignoré, HTTP/3, `app_role.sql` sans journal des migrations | alertes (T-OPS-ALERTING), digest de l'image Python (T-DEPS-PIN), jeton hors URL (T-WS-TOKEN), rétention distante (T-BACKUP-OFFSITE) |

Non vérifiable par les revues ni ici : réglages de l'environnement GitHub (approbateurs, règles de tag), comportement de la CI sur les exécuteurs GitHub (T-CI-FIRST-RUN).
