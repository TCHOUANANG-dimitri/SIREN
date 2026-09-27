# SIREN — Rapport de mise à niveau « socle intégrable » (application + serveur)

Branche : `feat/socle-integration-live` (depuis `master` @ `795bd1c`) · 27 septembre 2026
Documents liés : [contrats](contrats/) · [contradictions CDC](CDC-CONTRADICTIONS.md) ·
[traçabilité](TRACABILITE.md) · [risques](RISQUES.md) · [intégration serveur](INTEGRATION-SERVEUR.md)

## 1. Résumé exécutif

L'application avait un parcours d'écrans presque complet, mais **tout tournait sur
un backend simulé** : aucune ligne de code ne parlait au serveur FastAPI pourtant
présent dans le dépôt. Ce serveur, de son côté, **ne vérifiait pas à qui
appartenaient les données** : n'importe quel compte pouvait lire la position, l'historique
et le flux temps réel de n'importe quel enfant.

Après ce travail :

- l'app parle réellement au serveur en mode `live` (client HTTP unique, contrat validé,
  rafraîchissement de session, WebSocket ou polling), et le mock est isolé et **absent des builds live** ;
- le serveur applique le contrôle d'accès par enfant sur toutes les routes et le WebSocket,
  le plafond de 3 proches, la rotation des jetons, et corrige des erreurs de calcul
  (distances en degrés, jours décalés, fuseau, rayon ignoré) ;
- les parcours critiques ont été durcis : écran d'urgence non fermable par « retour », urgence
  détectée même sans WebSocket, fiche de disparition partageable, carte de chaleur réelle ;
- FR/EN sont complets et vérifiés par un test ; hors-ligne avec cache persistant et file d'actions.

Restent bloqués par des **dépendances externes ou des décisions d'équipe** : fournisseur SMS/email
(OTP, mot de passe oublié, invitations), Firebase (push app fermée), prestataire Mobile Money,
contrat Dispositif (secret d'appairage, canal descendant, format), modules IA réels (zone de recherche,
lieux appris), cadre juridique audio.

## 2. État initial (constaté dans le code, pas dans le CDC)

| Domaine | Constat |
|---|---|
| Réseau | `axios` installé, jamais utilisé. `EXPO_PUBLIC_API_MODE=live` n'avait aucun effet. `initMockBackend()` lancé dans tous les modes. |
| Temps réel | Écran d'urgence, bandeau hors-ligne et cache liés directement au bus du mock. |
| Serveur — sécurité | Aucune vérification d'appartenance (positions, historique, alertes, partages, audio, WebSocket). Refresh token introuvable (bcrypt salé) ⇒ déconnexion toutes les 30 min. Secrets d'exemple acceptés en production. |
| Serveur — logique | `GET /children/alerts` masqué par `GET /children/{id}`. `PATCH /children/{id}` plantait (`sleep_schedule`). Rayon de périmètre non stocké (100 m figé). Distances PostGIS en degrés comparées à des mètres. Jours 0 = lundi vs 0 = dimanche côté app. Horaires comparés en UTC. Une alerte créée **à chaque point** en pré-alerte. Double diffusion WS (direct + Redis). Signalements non modérés publiés, modérés masqués. |
| Contrats | `ts` vs `timestamp`, sous-scores 0–1 (mock) vs 0–100 (serveur), `sensitivity` texte vs nombre, clés push snake_case non lues par l'app, `zone-state` incompatible. |
| App — urgence | Retour Android possible, un seul contact appelable, 117 codé en dur, « Notifier le cercle » purement local, « Partager la fiche » sans effet, heatmap = cercles. |
| App — données | Valeurs inventées : autonomie « ~18 h / ~3 j / ~7 j », marqueur de recherche décalé de 0,001°, signalement en (0, 0) ou à la position **de l'enfant**, « forcer la synchro » réécrivant le mode d'énergie. |
| i18n | ~80 clés manquantes, des dizaines de textes en dur, formats de date `fr-FR` fixes. |
| Tests | 2 fichiers (28 tests) ; aucun test serveur. |

## 3. Fonctionnalités

- **Fonctionnelles (vérifiées par tests)** : client HTTP (refresh unique, pas de rejeu d'écriture), contrats v1,
  WebSocket (reconnexion, dédup, 4001), RBAC serveur, plafond 3 proches (app + serveur), triage de
  télémétrie, politique de mot de passe, fraîcheur des positions, plages d'historique, i18n, masquage des logs,
  règles de crédits, config d'environnement.
- **Partielles** : appairage (sans secret), réglages boîtier (effet matériel non défini), push (Firebase manquant),
  file hors-ligne (non éprouvée sur appareil), communauté (pas d'outil de modération), heatmap (données IA absentes).
- **Incorrectes et laissées en l'état (hors périmètre autorisé)** : hystérésis serveur (domaine IA, C6).
- **Absentes** : changement de mot de passe / 2FA dans les réglages (pas de route), confirmation des lieux appris,
  paiement réel, publicité, préférences de notification côté serveur, Sentry (SDK non ajouté).

## 4. Travaux réalisés (principaux)

**Application** — architecture dépôts `mock | live` derrière `api` ; client HTTP ; contrats Zod ; canal
temps réel abstrait ; `EmergencyGate` sur le cache du score + surveillance continue du score ;
écran d'urgence (retour bloqué, tous les contacts, confirmation, état réseau) ; post-disparition
(heatmap MapLibre, fiche partagée par le système) ; carte (fiabilité récente/estimée/perdue/hors-ligne,
batterie, recherche sans marqueur fictif) ; réglages dispositif honnêtes ; plage d'historique libre ;
raisons de risque expliquées ; notifications (canaux, jeton FCM, deep link app fermée, validation) ;
cache persistant, NetInfo, file d'actions non critiques ; purge complète à la déconnexion ;
masquage en arrière-plan ; écran d'erreur de configuration ; flags centralisés ; i18n complet.

**Serveur** — `core/authz.py` appliqué partout ; WebSocket autorisé et filtré par droit ; rotation
des refresh tokens (SHA-256 + `jti`) ; mot de passe ≥ 10 ; `OTP_MODE` ; `AUDIO_ENABLED` ;
refus des secrets d'exemple ; `timeutils` (jours, fuseau, créneaux de nuit) ; `geo` (WKB/WKT sans
shapely) ; ingestion (doublons, retards, futur, état du boîtier, alerte à l'escalade, publication WS) ;
scoring (distances en mètres, rayon réel, confiance réelle) ; push (canal urgence priorité max) ;
migration SQL `001` ; route `GET /risk/config` ; validation Pydantic des entrées.

## 5. Fichiers majeurs

Créés : `src/api/{index,repositories,errors,persistence,offlineQueue,session,queryClient}.ts`,
`src/api/http/client.ts`, `src/api/contracts/index.ts`, `src/api/live/index.ts`,
`src/api/realtime/*`, `src/api/mock/{entry,entry.live-stub,index,helpers,realtime}.ts`,
`src/config/business.ts`, `src/features/{auth/signOut,auth/passwordPolicy,tracking/freshness,tracking/historyRange,credits/*,risk/reasons,emergency/missingSheet,system/*}.ts(x)`,
`metro.config.js`, `jest.setup.js`, `server/app/core/{authz,timeutils,geo}.py`,
`server/app/services/telemetry.py`, `server/migrations/001_*.sql`, `server/tests/*`, `docs/*`.

Réécrits : `src/config/env.ts`, `src/app/_layout.tsx`, `(main)/_layout.tsx`, `(emergency)/urgence.tsx`,
`(emergency)/post-disparition.tsx`, `features/emergency/EmergencyGate.tsx`, `utils/{notifications,logger,format}.ts`,
toutes les routes serveur `app/api/v1/endpoints/*`, `services/{websocket_manager,scoring,push}.py`.

Déplacés : `src/api/services/*` → `src/api/mock/services/*` (ce sont les services du mock) ;
`geocodingService` → `src/services/`.

## 6. Dépendances

Ajoutées (versions compatibles Expo SDK 54 vérifiées, épinglées) :
`@react-native-community/netinfo@11.4.1` (version attendue par le SDK),
`@tanstack/react-query-persist-client@5.101.4`, `@tanstack/query-async-storage-persister@5.101.4`
(même version que `@tanstack/react-query`). Aucune retirée. Plugin `expo-notifications` déclaré.
Mises à jour de correctifs signalées par `expo install --check` (non appliquées) : `expo 54.0.37`,
`expo-constants 18.0.14`, `expo-local-authentication 17.0.9`, `jest-expo 54.0.18`.

## 7–9. Contrats

Voir `docs/contrats/api-app-serveur-v1.md`, `dispositif-serveur-v1.md` (**proposition à valider**
par le pôle Dispositif), `ia-v1.md` (dont l'**entrée manquante fréquence cardiaque / HRV**).

## 10–11. Tests

| Suite | Avant | Après |
|---|---|---|
| Application (Jest) | 2 fichiers, 28 tests | 16 fichiers, 116 tests — tous verts |
| Serveur (pytest) | 0 | 4 fichiers, 36 tests verts + 1 `xfail` (écart IA-07 documenté) |
| Lint | 0 erreur, 9 avertissements | 0 erreur, 9 avertissements (dépendances de hooks volontaires) |
| Typecheck | OK | OK |
| Bundle Android (mock / live) | — | OK ; bundle live sans base de démo ni moteur de scénario |
| APK release | — | voir §18 |

Non couvert : tests d'écrans / E2E (pas d'infrastructure Detox/Maestro), requêtes PostGIS
(nécessitent une base), latence IA < 5 s, performance mesurée sur appareil.

## 12–13. Bloquants et dépendances externes

1. **Firebase** : `google-services.json` (app) + `firebase-credentials.json` (serveur) — sans eux, pas de push app fermée.
2. **Fournisseur SMS / email** — OTP, mot de passe oublié, invitations.
3. **Pôle Dispositif** — secret d'appairage (QR), format et fréquence de télémétrie, canal descendant (demande de position), effet des modes d'énergie, événements (retrait).
4. **Pôle IA** — zone de recherche, lieux appris (confirmer / rejeter), hystérésis (C6), `modelVersion`, capteur cardiaque (C1).
5. **Prestataire Mobile Money** et prix des packs.
6. **Cadre juridique** audio / caméra.
7. **Accès o2switch** (URL de l'API).

## 14–15. Configuration o2switch et variables

Voir `docs/INTEGRATION-SERVEUR.md`. En résumé côté app : `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_API_MODE=live`,
`EXPO_PUBLIC_API_BASE_URL=https://…`, `EXPO_PUBLIC_WS_URL=` (vide en mutualisé). Côté serveur :
`ENVIRONMENT`, `SECRET_KEY`, `JWT_SECRET_KEY` (≥ 32 car.), `DATABASE_URL(_SYNC)`, `REDIS_ENABLED=false`,
`FCM_CREDENTIALS_PATH`, `OTP_MODE`, `AUDIO_ENABLED=false`, `DEFAULT_TIMEZONE`. Aucun secret dans Git.

## 16. Décisions à valider par l'équipe

- `OTP_MODE=disabled` hors développement tant qu'aucun fournisseur n'existe (alternative : bloquer toute inscription).
- Conservation de MapLibre/OSM au lieu de Google Maps (C13).
- Seuils : 20 % batterie faible, 100 m de précision « GPS récent », 35 / 65 min pour « estimée » / « perdue ».
- Numéro d'urgence 117 (police) sur l'écran d'urgence.
- Purge immédiate ou différée des positions à la suppression de compte.
- Maintien temporaire de la WebView Faucon.
- Coûts en crédits et prix des packs (proposition du CDC non figée dans l'app).

## 17. Risques résiduels

Voir `docs/RISQUES.md` — principalement : appairage sans secret (critique, ouvert), push non
branché, OTP, hystérésis serveur, absence de temps réel sur o2switch mutualisé.

## 18. Lancement et build

```bash
cp .env.example .env && npm ci
npm run lint && npm run typecheck && npm test
npx expo start                                   # mock par défaut
npx expo prebuild --platform android && cd android && ./gradlew assembleRelease
```

Note : `@maplibre/maplibre-react-native` et NetInfo sont des modules natifs : utiliser un
**development build** (`expo run:android`) plutôt qu'Expo Go.

## 19. Intégration serveur

`docs/INTEGRATION-SERVEUR.md` (préparation, migration, variables, liste de vérification staging).

## 20. Suite recommandée (par priorité)

1. P0 — Secret d'appairage (Dispositif + serveur + app).
2. P0 — Firebase (push) puis test « urgence app fermée » sur deux téléphones Android.
3. P1 — Déployer sur o2switch (staging), dérouler la liste de vérification.
4. P1 — Fournisseur OTP/email ; route « changer le mot de passe ».
5. P1 — Hystérésis serveur (IA) ; tâche « dispositif hors ligne » ; zone de recherche.
6. P2 — Crédits + Mobile Money ; préférences de notification serveur ; modération communautaire.
7. P2 — Tests E2E (Maestro) sur les parcours inscription → urgence ; mesure du démarrage à froid.
