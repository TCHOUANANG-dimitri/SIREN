# Budget de risque

| Niveau | Risque | Cause | Impact | Mitigation | Statut |
|---|---|---|---|---|---|
| CRITIQUE | Accès aux données d'un enfant par n'importe quel compte | Aucune vérification d'appartenance côté serveur (positions, historique, WebSocket, partages…) | Suivi d'un enfant par un tiers | `core/authz.py` sur toutes les routes, WS autorisé avant acceptation, 404 pour les tiers | **Corrigé** (tests `test_authz.py`) |
| CRITIQUE | Appairage d'un boîtier par simple identifiant | Aucun secret d'appairage (QR) | Un tiers revendique le boîtier et suit l'enfant | Signalé ; `find_device` ne révèle plus un boîtier déjà associé | **Ouvert** — contrat Dispositif (C12) |
| CRITIQUE | Serveur de production avec secrets d'exemple | `JWT_SECRET_KEY` par défaut | Jetons falsifiables | Démarrage refusé hors développement | **Corrigé** |
| CRITIQUE | Urgence non détectée hors WebSocket | L'ouverture de l'écran d'urgence dépendait du bus mock | Parent non averti en production | Détection sur le cache du score + polling 15 s | **Corrigé** ; push FCM **ouvert** (google-services.json) |
| IMPORTANT | Push absent app fermée | Pas de google-services.json, compte Firebase | Urgence invisible si l'app est fermée | Enregistrement du jeton natif, canal urgence priorité max côté serveur | **Ouvert** (🔵 Firebase) |
| IMPORTANT | OTP sans valeur | Aucun fournisseur SMS/email | Comptes non vérifiés | `OTP_MODE` explicite ; code fixe refusé hors dev | **Ouvert** (🔵 fournisseur) |
| IMPORTANT | Écoute audio illégale | Cadre juridique non validé | Atteinte à la vie privée d'un mineur | Désactivée par défaut app + serveur, motif obligatoire, journal | Maîtrisé (bloqué) |
| IMPORTANT | Oscillation des alertes | Hystérésis serveur incomplète (C6) | Fatigue d'alerte | Alerte créée seulement à l'escalade (plus une par point) | **Partiel** — règle IA à aligner |
| IMPORTANT | Pas de temps réel sur o2switch | Passenger/WSGI | Latence de détection jusqu'à ~15 s | Polling ; push pour l'arrière-plan | Accepté pour le pilote (C14) |
| IMPORTANT | Données de démo dans l'APK de production | Mock embarqué | Données fictives exposées, confusion | Stub Metro en live + mock interdit en `production` | **Corrigé** (vérifié sur bundle) |
| IMPORTANT | Faucon (service tiers) | WebView vers une IP publique non maîtrisée | Localisation hors périmètre SIREN | Désactivable par configuration | Accepté temporairement (C20) |
| MOYEN | Refresh token jamais retrouvé | Empreinte bcrypt salée | Déconnexion toutes les 30 min | SHA-256 + rotation + migration | **Corrigé** |
| MOYEN | Signalement communautaire géolocalisé sur l'enfant | Position de l'enfant utilisée | Publication de la position d'un mineur | Position du téléphone du parent, fix réel exigé | **Corrigé** |
| MOYEN | Doublons / retards de télémétrie | Renvois GSM, buffers hors couverture | Scores faussés | Triage par horodatage device, rejet du futur | **Corrigé** |
| MOYEN | Crédits mal calibrés | Tarifs non validés | Coût familles / financement | Paramètres centralisés, flag désactivé | **Ouvert** (décision équipe) |
| MOYEN | Perte du keystore Android | Fichier hors Git | Mise à jour store impossible | Documenté (sauvegarde hors Git) | **Ouvert** (procédure équipe) |
| FAIBLE | Logs contenant des positions / jetons | `console` sans filtre | Fuite via journaux | `logger.redact` | **Corrigé** |
| FAIBLE | Aperçu d'app dans le sélecteur de tâches | Pas de masquage | Carte visible | `PrivacyShield` | **Corrigé** |
