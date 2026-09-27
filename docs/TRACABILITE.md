# Matrice de traçabilité CDC → code → tests

Statuts : 🟢 conforme · 🟡 partiel · 🔴 absent / incorrect · 🔵 dépend d'un service ou pôle externe · ⚪ ambigu, à confirmer.
« Avant » = état constaté au commit `795bd1c` ; « Après » = branche `feat/socle-integration-live`.
Chemins de tests : `src/**/__tests__` (Jest) et `server/tests` (pytest).

## Socle technique

| ID | Exigence | Implémentation | Test | Avant | Après |
|---|---|---|---|---|---|
| APP-TECH-01 | Client HTTP centralisé (jeton, refresh, erreurs) | `src/api/http/client.ts` | `api/__tests__/httpClient.test.ts` | 🔴 | 🟢 |
| APP-TECH-02 | Mode live appelle le serveur | `src/api/live/index.ts`, `src/api/index.ts` | `contracts.test.ts` | 🔴 | 🟡 (non testé contre un serveur réel déployé) |
| APP-TECH-03 | Mock isolé, absent des builds live | `src/api/mock/entry.ts`, `metro.config.js` | vérifié sur bundle exporté | 🔴 | 🟢 |
| APP-TECH-04 | Validation des réponses (contrat versionné) | `src/api/contracts/index.ts` | `contracts.test.ts` | 🔴 | 🟢 |
| APP-TECH-05 | WebSocket avec reconnexion | `src/api/realtime/wsChannel.ts` | `wsChannel.test.ts` | 🔴 | 🟢 (🔵 indisponible sur o2switch mutualisé) |
| APP-TECH-06 | Variables d'environnement validées, sans crash | `src/config/env.ts`, `ConfigErrorScreen` | `config/__tests__/env.test.ts` | 🟡 | 🟢 |
| APP-TECH-07 | Carte fonctionnelle en APK release | MapLibre (sans clé) | build release | 🟡 | 🟢 (choix ≠ CDC, voir C13) |
| APP-TECH-08 | Observabilité (Sentry) | `utils/logger.ts` (`setLogSink`, masquage) | `utils/__tests__/logger.test.ts` | 🔴 | 🟡 (SDK non ajouté : DSN à fournir) |
| APP-TECH-09 | FlashList | — | — | ⚪ | ⚪ (listes courtes : pas de gain mesuré, non migré) |

## 4.1 Compte et authentification

| ID | Exigence | Implémentation | Test | Avant | Après |
|---|---|---|---|---|---|
| APP-AUTH-01 | Inscription, mot de passe fort 10 car. | `passwordPolicy.ts`, `schemas/auth.py` | `passwordPolicy.test.ts`, `test_security_and_scoring.py` | 🟡 (6 car.) | 🟢 |
| APP-AUTH-02 | OTP réel | `useRegister`, `OTP_MODE` serveur | `test_routes.py` | 🔴 | 🔵 (fournisseur SMS/email) |
| APP-AUTH-03 | Connexion, jetons Keystore | `authStore`, `secureStorage` | — | 🟡 | 🟢 |
| APP-AUTH-04 | Refresh token réel | client HTTP + rotation serveur | `httpClient.test.ts`, `test_security…` | 🔴 (serveur cassé) | 🟢 |
| APP-AUTH-05 | 2FA à la connexion | branche `twofaRequired` → OTP | — | 🔴 | 🔵 (fournisseur + flux jeton temporaire) |
| APP-AUTH-06 | Mot de passe oublié | `POST /auth/forgot` | — | 🔴 | 🔵 (email transactionnel) |
| APP-AUTH-07 | Biométrie locale | `BiometricGate` | — | 🟢 | 🟢 |
| APP-AUTH-08 | Changement mot de passe / 2FA dans réglages | — | — | 🔴 | 🔴 (pas de route serveur) |
| APP-AUTH-09 | Purge à la déconnexion | `features/auth/signOut.ts` | — | 🟡 | 🟢 |

## 4.2 Enfants et dispositif

| ID | Exigence | Implémentation | Test | Avant | Après |
|---|---|---|---|---|---|
| APP-DEV-01 | Ajout enfant + appairage QR/ID | `add-child.tsx`, `POST /children` | — | 🟡 | 🟡 (🔵 code d'appairage secret, C12) |
| APP-DEV-02 | Vérification en ligne / batterie | `GET /children/devices/{id}` | — | 🟡 | 🟢 |
| APP-DEV-03 | Contexte jour 1 (maison, école, horaires) | `context-wizard.tsx` | — | 🟡 | 🟡 (polygone absent) |
| APP-DEV-04 | Réglages énergie / sensibilité → boîtier | `DeviceTab`, `device_settings.py`, `/pack` | `test_routes.py` | 🔴 (UI seule) | 🟡 (🔵 effet sur le boîtier) |

## 4.3 Suivi, carte, lieux, historique

| ID | Exigence | Implémentation | Test | Avant | Après |
|---|---|---|---|---|---|
| APP-TRK-01 | Sortie de périmètre (rayon parent) | `geofences.py`, `scoring.py` | — | 🔴 (rayon ignoré, distances en degrés) | 🟡 (non testé sur PostGIS réel) |
| APP-TRK-02 | Lieux appris confirmables | — | — | 🔴 | 🔵 (route serveur + module IA) |
| APP-TRK-03 | Cadence 30 min + fiabilité affichée | `freshness.ts`, `TRACKING_POLICY` | `freshness.test.ts` | 🔴 | 🟡 (facturation 🔵) |
| APP-TRK-04 | Carte temps réel + incertitude + fiabilité | `MapTab` | — | 🟡 | 🟢 |
| APP-TRK-05 | Demander la position maintenant | `requestFix` | — | 🟡 (mock) | 🔵 (canal boîtier, C5) |
| APP-TRK-06 | Historique + plage libre | `historyRange.ts`, `HistoryTab` | `historyRange.test.ts` | 🟡 | 🟢 (lieux visités avec horaires : 🔵) |
| APP-TRK-07 | Score, raisons expliquées, confiance | `RiskTab`, `features/risk/reasons.ts` | — | 🟡 | 🟢 |

## 4.4 Alertes et urgence

| ID | Exigence | Implémentation | Test | Avant | Après |
|---|---|---|---|---|---|
| APP-ALR-01 | Alertes serveur (une par escalade) | `telemetry.should_raise_alert` | `test_time_and_telemetry.py` | 🔴 (une alerte par point) | 🟢 |
| APP-ALR-02 | Acquitter / fausse alerte (serveur) | `alerts.py` | — | 🔴 (seul « resolue ») | 🟢 |
| APP-ALR-03 | Écran d'urgence non fermable par « retour » | `urgence.tsx` (`BackHandler`) | — | 🔴 | 🟢 |
| APP-ALR-04 | Urgence ouverte en polling comme en WS | `EmergencyGate` (cache du score), `useRiskWatch` | — | 🔴 (bus mock seulement) | 🟢 |
| APP-ALR-05 | Appeler tous les contacts + secours | `urgence.tsx`, `EMERGENCY_NUMBERS` | — | 🟡 | 🟢 (appel « enfant » : 🔵) |
| APP-ALR-06 | Heatmap post-disparition | `Heatmap` MapLibre | — | 🔴 (cercles) | 🟡 (données IA 🔵) |
| APP-ALR-07 | Fiche partageable (WhatsApp/SMS) | `missingSheet.ts`, `Share` | — | 🔴 | 🟢 |
| APP-ALR-08 | Écoute audio encadrée | flags + motif obligatoire | — | 🔴 | ⚪ (bloquée : cadre juridique) |

## 4.5 Partage (RBAC)

| ID | Exigence | Implémentation | Test | Avant | Après |
|---|---|---|---|---|---|
| APP-RBAC-01 | Contrôle d'accès serveur par enfant | `server/app/core/authz.py` | `test_authz.py` | 🔴 (**aucun**) | 🟢 |
| APP-RBAC-02 | Plafond 3 secondaires | authz + mock + écran d'invitation | `test_authz.py` | 🔴 | 🟢 |
| APP-RBAC-03 | Vue « zone seule » sans coordonnées | `zone-state`, filtre WS par droit | `contracts.test.ts` | 🟡 (masquage visuel) | 🟢 |
| APP-RBAC-04 | Journal d'accès des secondaires | `log_secondary_access` | — | 🟡 (mock) | 🟢 |
| APP-RBAC-05 | Invitation par email/téléphone | `sharing.py` | — | 🟡 | 🟡 (envoi d'invitation 🔵) |

## 4.6 Communauté, réglages, i18n, monétisation

| ID | Exigence | Implémentation | Test | Avant | Après |
|---|---|---|---|---|---|
| APP-COM-01 | Signalements modérés | `community.py` (liste = modérés) | — | 🔴 (inverse) | 🟡 (outil de modération 🔵) |
| APP-COM-02 | Toggle proximité persisté | stockage local | — | 🔴 | 🟡 (envoi 🔵) |
| APP-I18N-01 | FR/EN complets | `fr.json` / `en.json` | `i18n/__tests__/completeness.test.ts` | 🔴 | 🟢 |
| APP-SET-01 | Préférences notif par enfant, serveur | local seulement | — | 🟡 | 🟡 (route serveur 🔵) |
| APP-SET-02 | Suppression de compte | `DELETE /users/me` + `signOut` | — | 🟡 | 🟢 (purge physique : ⚪) |
| APP-PAY-01 | Crédits : règles, urgence jamais bloquée | `features/credits/rules.ts` | `rules.test.ts` | 🔴 | 🟡 (flag off) |
| APP-PAY-02 | Paiement Mobile Money | `features/credits/payment.ts` (abstraction) | — | 🔴 | 🔵 (prestataire non choisi) |
| APP-ADS-01 | Publicité hors urgence | flag `ads` (désactivé) | — | 🔴 | 🔵 (AdMob + politique Familles) |

## 5–6 Notifications, hors-ligne

| ID | Exigence | Implémentation | Test | Avant | Après |
|---|---|---|---|---|---|
| APP-NOT-01 | Jeton push enregistré serveur | `syncPushToken` | — | 🔴 | 🟡 (🔵 google-services.json) |
| APP-NOT-02 | Canaux urgence / pré-alerte / info | `ensureNotificationChannels`, `push.py` | — | 🔴 | 🟢 |
| APP-NOT-03 | Deep link (app fermée incluse), validé | `useNotificationDeepLink`, `parseNotificationData` | `notifications.test.ts` | 🟡 (clés incompatibles serveur) | 🟢 |
| APP-OFF-01 | Cache persistant + bandeau HH:MM | `persistence.ts`, `OfflineBanner` | `persistence.test.ts` | 🔴 | 🟢 |
| APP-OFF-02 | File d'actions non critiques | `offlineQueue.ts` | — | 🔴 | 🟡 (rejeu non testé sur appareil) |
| APP-OFF-03 | Actions critiques exigent le réseau | `networkMode: 'always'`, bouton désactivé | `httpClient.test.ts` (pas de rejeu d'écriture) | 🔴 | 🟢 |

## 8 Non fonctionnel

| ID | Exigence | Implémentation | Test | Avant | Après |
|---|---|---|---|---|---|
| APP-SEC-01 | Masquage de l'app en arrière-plan | `PrivacyShield` | — | 🔴 | 🟢 |
| APP-SEC-02 | Aucune donnée sensible dans les logs | `logger.redact` | `logger.test.ts` | 🔴 | 🟢 |
| APP-SEC-03 | Secrets serveur par défaut refusés | `unsafe_production_settings` | `test_security_and_scoring.py` | 🔴 | 🟢 |
| APP-PERF-01 | Démarrage < 3 s | splash non bloqué par la localisation, délai max 2,5 s | — | ⚪ | ⚪ (non mesuré sur appareil) |
| APP-A11Y-01 | Libellés d'accessibilité traduits | écrans principaux | — | 🟡 | 🟡 (audit contraste non fait) |
