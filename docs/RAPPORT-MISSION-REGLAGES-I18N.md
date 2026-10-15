# Rapport — thème, Réglages, juridique, i18n, notifications, emails, 2FA, partage

Branche : `master` (travail non commité). Date : 30/09/2026.
Statuts : **Réel** (fonctionne en live), **Mock** (démo seulement), **Partiel**,
**Absent**, **Bloqué** (dépend d'une information ou d'un accès externe).

## 1. Audit initial (résumé)

| # | Constat |
|---|---|
| Architecture | Expo Router, repository `api` mock/live, TanStack Query, Zustand, i18next (1 fichier/langue), tokens centralisés, serveur FastAPI dans le dépôt. |
| Réutilisable | tokens (`src/theme`), `Banner/Button/Card/TextField/SegmentedTabs`, `ApiError` + client HTTP, contrats Zod, `authz` serveur, `push.py`. |
| Thème | Palette unique claire, 53 fichiers avec styles statiques ; `userInterfaceStyle: light`. |
| Réglages | Une page avec profil, langue, notifications, biométrie, démo ; « Mentions » et « Confidentialité » = boîtes de dialogue d'une phrase. |
| Notifications | Préférences stockées mais **jamais lues** (réglage sans effet) ; push serveur en français seulement ; secondaires notifiés sans vérifier leurs droits. |
| Emails | Aucun ; `/auth/forgot` répondait `sent: true` sans rien envoyer (écran « lien envoyé » faux). |
| 2FA | `login` délivrait les jetons **même si la 2FA était requise** (contournable) ; aucun réglage. |
| Partage | Auto-invitation refusée côté serveur seulement après recherche, sans code d'erreur exploitable ; mock créant des comptes fantômes ; écrans de détail en français en dur, erreurs non gérées. |
| Sélecteurs d'enfant | Voir §6 (cause réelle identifiée). |
| i18n | Textes en dur (onglets de la fiche enfant, suppression de périmètre, biométrie, statuts de partage, libellés d'état de risque), terminologie EN incohérente. |
| Dépendances | `bcrypt` non figé côté serveur (incompatible), `expo-asset` non résolu côté app (voir §9). |

## 2. Réalisé

| Objectif | Implémentation | Statut |
|---|---|---|
| 1. Thème | Palettes clair/sombre de mêmes clés (`tokens.ts`), `useTheme` / `makeStyles`, préférence Système/Clair/Sombre persistée, navigation, barre d'état, fond natif, composants système (`AppThemeProvider`) ; 53 fichiers migrés ; contrastes AA testés. | Réel |
| 2. Réglages | Page par sections : Compte, Sécurité, Préférences (langue, apparence), Notifications, Famille, Informations, Démo (mock), Session ; composants `SettingsSection/Row/Choice`. | Réel |
| 3. À propos | Nom, logo, version, build (si déclaré), mission (CDC), environnement, source des données, contrat API, équipe (pôles), crédits cartographiques, renvoi aux mentions légales. Aucun contact ni URL inventés. | Réel |
| 4. Juridique | 5 documents FR/EN versionnés (`src/legal`), écrans liste + lecture (accessibles connecté ou non), liens depuis l'inscription, versions acceptées envoyées au serveur. | Réel (textes **provisoires**, validation juridique requise) |
| 5. Push multilingue | Catalogue serveur par type, langue du destinataire, payload structuré (`type`, clés, variables), canaux, filtrage par droits, jeton expiré supprimé ; app : routage par type, noms de canaux traduits, affichage app ouverte selon préférences. | Réel côté code ; **Bloqué** en production (Firebase) |
| 6. FR/EN | Découpage par domaine, glossaire, ~60 libellés corrigés, textes en dur supprimés, pluriels. | Réel |
| 7. Emails | 6 modèles FR/EN versionnés, envoi SMTP, OTP sécurisés, alertes de sécurité ; aucun faux succès. | Réel côté code ; **Bloqué** (identifiants SMTP, expéditeur) |
| 8. Auto-invitation | Détection locale (email insensible à la casse, téléphone avec/sans indicatif) + refus serveur **avant** recherche (`self_invite`) + mock identique. | Réel |
| 9. Sélecteurs Carte / Partage | Composant commun `ChildSelector` + `useSelectedChild` (source unique, sélection périmée corrigée). | Réel |
| 10. i18n | `npm run i18n:check`, tests de parité et de variables, règle de priorité de la langue. | Réel |
| 2FA | Login sans jeton avant le code, vérification / renvoi, activation-désactivation avec mot de passe, changement et réinitialisation du mot de passe. | Réel côté code ; **Bloqué** tant qu'aucun canal email n'est configuré (activation refusée, 503) |

## 3. Décisions prises (et pourquoi)

- **Thème** : choix Clair / Sombre / Système validé par le fondateur. La carte reste
  sur fond clair (style OpenFreeMap « liberty ») en mode sombre.
- **Couleurs** : trois teintes de texte ajustées en mode clair pour atteindre le
  contraste AA exigé par le CDC (§8) : `muted` #7A776F→#6F6C65, `prealerte`
  (texte) #E08A00→#9A5B00, `urgence` (texte) #D32F2E→#C62828, `veille` (texte)
  #2E7D52→#27704A. Le rouge de marque #D32F2E reste inchangé pour les boutons et
  remplissages d'urgence.
- **Notifications d'urgence** : la bascule « Urgence » ne faisait rien ; elle est
  remplacée par la mention « Toujours actives », qui décrit le comportement réel.
- **Traduction des notifications** : côté serveur (seul moyen de traduire une
  notification reçue app fermée) + payload structuré pour l'app.
- **Emails** : SMTP générique pour ne pas choisir de prestataire à la place de l'équipe.
- **Mot de passe oublié** : code par email (pas de lien) — pas de dépendance aux liens
  universels ; réponse identique que le compte existe ou non.
- **Invitation** : le mock exige désormais un compte existant, comme le serveur.
- **Journal des accès** : le serveur enregistre le code du droit (traduisible) au
  lieu d'un libellé français ; les anciennes entrées s'affichent telles quelles.
- **Sécurité (correctif)** : les proches ne reçoivent plus une alerte que s'ils ont
  le droit correspondant (`alertes_urgence` / `alertes_prealerte`), conformément à la
  matrice RBAC du CDC — auparavant tous les partages actifs la recevaient.

## 4. Mock / réel / absent

| Fonction | Mock | Live |
|---|---|---|
| Codes (inscription, 2FA, reset) | Code fixe affiché « Test uniquement » | Code aléatoire par email si `EMAIL_BACKEND=smtp` + `OTP_MODE=email` ; sinon `503` / étape déclarée non requise |
| Invitation | Pas d'email (`notified=false`) | Email + push à l'invité si configurés ; `notified` reflète l'envoi réel |
| Préférences de notification | Filtre l'affichage app ouverte | Idem ; **pas** de préférences serveur (voir §7) |
| Langue du compte | Stockée | Envoyée au serveur, utilisée pour push et emails |
| Acceptation des CGU | Versions ignorées | Versions et date enregistrées (migration 002) |

## 5. Fichiers principaux

App : `src/theme/{tokens,theme,AppThemeProvider}.ts(x)`, `src/stores/preferencesStore.ts`,
`src/i18n/{resources,language,index}.ts`, `src/i18n/locales/**`, `src/legal/**`,
`src/app/legal/*`, `src/app/(main)/settings/{about,security}.tsx`,
`src/app/(main)/(tabs)/{settings,sharing,map}.tsx`, `src/app/(main)/sharing/*`,
`src/app/(auth)/{otp,forgot-password,reset-password,register}.tsx`,
`src/components/SettingsList.tsx`, `src/features/children/{ChildSelector,useSelectedChild}.ts(x)`,
`src/features/sharing/inviteRules.ts`, `src/api/{errors,repositories,contracts,live,mock}/…`,
`src/utils/notifications.ts`, `scripts/i18n-check.mjs`.
Serveur : `app/core/errors.py`, `app/services/{otp,identifiers,push,security_notifications}.py`,
`app/services/email/*`, `app/models/otp_challenge.py`, endpoints `auth`, `users`,
`sharing`, `device_ingestion`, `tracking` ; `migrations/002_otp_email_legal.sql`.

## 6. Sélecteurs d'enfant — cause réelle

Un `ScrollView` horizontal a `flexGrow: 1` par défaut. Placé dans une colonne
au-dessus de la carte (ou de la liste des partages), il prenait une partie de la
hauteur, étirait les puces et réduisait la carte ; les puces faisaient ~30 px
(cible CDC ≥ 48 px), sans retour au toucher ni état accessible, et n'apparaissaient
qu'à partir de deux enfants (l'écran Partage ne montrait donc pas sur quel enfant on
agissait). Correctifs : `flexGrow: 0`, cible 48 px, `accessibilityRole="tab"` +
`selected`, retour visuel, affichage dès un enfant, nom de l'enfant rappelé dans
l'invitation et le détail d'un partage, sélection périmée corrigée dans le store.

## 7. Problèmes découverts — non modifiés

| Niveau | Problème | Impact | Recommandation |
|---|---|---|---|
| IMPORTANT | Aucun moyen pour une personne invitée de **voir et accepter** une invitation (ni route « mes invitations », ni écran). | En live, un partage reste « invité » : le proche n'a jamais accès. | [PROPOSITION — NON INTÉGRÉE] `GET /users/me/invitations` + écran « Invitations reçues » (accepter / refuser via le `PATCH` existant). |
| IMPORTANT | Pas de limitation des tentatives de connexion (mot de passe). | Force brute possible. | Limiter par compte et par IP (compteur en base ou Redis), code `rate_limited`. |
| IMPORTANT | Préférences de notification non enregistrées côté serveur, ni par enfant (CDC §4.6). | Les notifications app fermée ignorent ces choix. | [PROPOSITION — NON INTÉGRÉE] `PUT /users/me/notification-prefs` + filtre dans `push._recipients`. |
| MOYEN | Pas de ré-acceptation quand un document juridique change de version. | Consentement potentiellement obsolète. | Écran bloquant au démarrage si `terms_version` ≠ version courante. |
| MOYEN | Invitation d'une personne sans compte impossible. | Frein à l'adoption. | Invitation « en attente » par email (table dédiée, expiration). |
| MOYEN | Changement d'adresse email absent. | — | Route avec confirmation par code sur la nouvelle adresse. |
| MINEUR | Carte claire en mode sombre. | Contraste fort la nuit. | Style de carte sombre (à tester en release). |
| MINEUR | Messages de `ConfigErrorScreen` en français (écran technique de build mal configuré). | Visible seulement sur une build erronée. | Laisser technique ou traduire. |
| MINEUR | 12 clés i18n anciennes non utilisées (`npm run i18n:check`). | Aucun. | Supprimer lors d'un nettoyage. |
| HORS PÉRIMÈTRE | Mises à jour correctives Expo proposées par `expo install --check` (expo 54.0.37, expo-constants, expo-local-authentication, jest-expo). | — | Appliquer dans une tâche dédiée. |

## 8. Points bloquants et décisions attendues

1. **Emails** : expéditeur, serveur SMTP, SPF/DKIM/DMARC ; puis `OTP_MODE=email`.
2. **Firebase** (push) : `google-services.json` + compte de service.
3. **Juridique** : identité de l'éditeur, contacts, hébergeur, durées de conservation,
   formalités auprès de l'autorité, relecture par un juriste (`docs/JURIDIQUE.md`).
4. **Invitations reçues** (§7) : valider la proposition.
5. **Migration 002** à appliquer sur la base (additive, rollback fourni).

## 9. Dépendances

- Ajout `expo-asset@12.0.13` (dépendance directe) : `expo-font` l'importe ; après la
  réinstallation, il n'était plus résolu qu'à l'intérieur de `expo/`, ce qui cassait
  le chargement des polices (tests) et risquait de casser la build.
- Ajout `@babel/runtime@7.29.7` (dev) : requis par l'environnement de test React Native.
- Serveur : `bcrypt==4.0.1` figé — sans cela pip installe bcrypt 5, incompatible avec
  `passlib 1.7.4` : `hash_password` échoue, **inscription et connexion cassées**.
- Aucune nouvelle bibliothèque fonctionnelle (thème, i18n, emails via stdlib `smtplib`).

## 10. Vérifications exécutées

| Commande | Résultat |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | 0 erreur, 10 avertissements (mêmes catégories qu'avant) |
| `npm run i18n:check` | 0 clé manquante, 0 variable incohérente, 0 texte en dur détecté ; 12 clés inutilisées (avertissement) |
| `npm test` | 23 suites, 186 tests OK |
| `pytest` (serveur) | 90 OK, 1 xfail documenté (hystérésis C6) |
| Build Android release (`expo prebuild --clean` + `gradlew assembleRelease`) | BUILD SUCCESSFUL — APK non testé sur appareil |

Non vérifié sur appareil : rendu visuel des écrans en mode sombre, notifications
réelles (Firebase absent), envoi d'emails réels (SMTP absent).
