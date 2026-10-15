# Notifications — chaîne complète et types

## Chaîne

```
Événement (télémétrie / action)          server/app/api/v1/endpoints/device_ingestion.py, sharing.py
 → destinataires filtrés par droits       server/app/services/push.py (_recipients)
 → texte dans la langue du destinataire   push.NOTIFICATIONS[type][users.langue]
 → FCM (canal Android, priorité, tag)     push._send_fcm — jeton expiré supprimé
 → OS : affichage (app fermée / fond)
 → app ouverte : handler                  src/utils/notifications.ts (shouldDisplay)
 → tap → validation du payload            parseNotificationData (identifiants filtrés)
 → deep link                              src/features/notifications/useNotificationDeepLink.ts
```

Enregistrement du jeton : `syncPushToken` (jeton natif FCM, pas Expo Push),
renvoyé au serveur s'il change ; un jeton passé à un autre compte est retiré de
l'ancien. Noms des canaux Android traduits et mis à jour au changement de langue.

## Types

| Type | Déclencheur | Priorité / canal | Destinataires | Texte FR (titre — corps) | Texte EN | Ouverture | App ouverte | App fermée |
|---|---|---|---|---|---|---|---|---|
| `urgence` | Score passe en urgence (une alerte par escalade) | max / `siren-urgence` | parent + proches avec `alertes_urgence` | Urgence — {child} — Situation anormale détectée. Ouvrez SIREN immédiatement. | Emergency — {child} — Abnormal situation detected. Open SIREN now. | Écran d'urgence | Toujours affichée ; l'écran d'urgence s'ouvre aussi via `EmergencyGate` | Affichée par le système |
| `prealerte` | Score passe en pré-alerte | haute / `siren-prealerte` | parent + proches avec `alertes_prealerte` | Pré-alerte — {child} — Comportement inhabituel détecté. Vérifiez la situation. | Pre-alert — {child} — Unusual behaviour detected. Please check the situation. | Détail de l'alerte | Selon Réglages → Pré-alertes | Affichée |
| `low_battery` | Événement `low_battery` du dispositif | normale / `siren-information` | parent principal | Batterie faible — {child} — Le dispositif de {child} doit être rechargé bientôt. | Low battery — {child} — {child}'s device needs charging soon. | Fiche de l'enfant | Selon Réglages → Informations | Affichée |
| `share_invite` | Création d'un partage | normale / `siren-information` | personne invitée | Nouvel accès partagé — {inviter} partage avec vous le suivi de {child}… | New shared access — {inviter} is sharing {child}'s monitoring… | Accueil | Selon Réglages → Informations | Affichée |

Les urgences ne sont jamais filtrées par l'app. Aucune position n'apparaît dans une notification.

## Absents ou partiels (non inventés)

| Événement | État | Blocage |
|---|---|---|
| Entrée / sortie de périmètre | Pris en compte dans le score (`hors_perimetre`), pas de notification dédiée | Règle produit + événement serveur à définir |
| Dispositif hors ligne | Non détecté côté serveur | Tâche planifiée (absence de télémétrie) à créer |
| Sécurité (mot de passe, 2FA) | Envoyé **par email**, pas en push | — |
| Préférences par type et par enfant côté serveur | Non implémenté : l'app filtre seulement l'affichage app ouverte | Route `PUT /users/me/notification-prefs` — [PROPOSITION — NON INTÉGRÉE] |
| APNs (iOS) | Non implémenté | Compte Apple |
| Firebase | Code prêt | `google-services.json` + compte de service à fournir |

## Payload `data` (v1)

`v`, `type`, `titleKey`, `bodyKey`, `vars` (JSON), `lang`, `childId`/`child_id`,
`alertId`/`alert_id`, `level`, `score`. Toutes les valeurs sont des chaînes (FCM).
