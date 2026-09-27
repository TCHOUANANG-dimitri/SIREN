# Contrats des modules IA — v1 (état réel et entrées manquantes)

> CDC IA V1 §2–3. L'application **ne calcule aucun score** : elle affiche ce que
> le serveur produit. Ce document liste, par module, les entrées réellement
> disponibles aujourd'hui et ce qui manque.

| Module (CDC IA) | Entrées nécessaires | Entrées disponibles aujourd'hui | Sortie attendue | État serveur |
|---|---|---|---|---|
| Itinéraire (DBSCAN + Markov + corridors) | positions horodatées | oui (télémétrie) | sous-score `geo` 0–100, lieux appris | Heuristique simple (distance aux lieux) ; DBSCAN dans la tâche nocturne `retrain` |
| Anomalie cardiaque | **fréquence cardiaque, HRV** | **NON — aucun capteur prévu** (CDC Dispositif : GPS, GSM, MPU6050, batterie) | sous-score cardiaque | **MISSING INPUT CONTRACT** : ne pas implémenter tant que le matériel n'existe pas |
| Mouvement (IMU, Random Forest) | fenêtres accéléromètre / gyroscope | partiel : `imu.accMax` seulement | sous-score `mouvement` | Seuils sur `accMax` (0.4 / 0.8) |
| Événements sonores (YAMNet) | audio classé **sur le boîtier** | **NON** — pas de micro contractualisé, cadre juridique | étiquettes (cri, voix, véhicule) | Journal d'activation seulement, `AUDIO_ENABLED=false` |
| Mode de transport | vitesse, accélération | vitesse oui, IMU partielle | pied / moto / voiture | Non implémenté |
| Zone de recherche (heatmap) | dernier point, mode de transport, réseau routier | dernier point oui | `cells[{lat,lon,weight 0–1}]`, `topZones`, `confidence` 0–100, `generatedAt` | **Réponse vide** ; l'app affiche « pas encore calculée » |
| Fusion | sous-scores | `universel`, `declaratif`, `geo`, `mouvement` | score 0–100, état, raisons, confiance | Pondérée + concordance ; **hystérésis incomplète** (voir contradictions) |

## Sortie `RiskScore` (serveur → app)

| Champ | Type | Remarque |
|---|---|---|
| `score` | 0–100 | |
| `state` | `veille | prealerte | urgence | disparition` | Seuils 30 / 70 (`GET /risk/config`) |
| `subScores` | `{geo, mouvement, universel, declaratif}` 0–100 | Le mock app produisait du 0–1 : corrigé |
| `reasons` | `string[]` | Codes actuels : `concordance:<n> signaux actifs`, `contexte:nuit`, `contexte:hors_perimetre` — l'app les explique, n'en invente pas |
| `confidence` | 0–100 | Maturité couche 3 de l'enfant (était figée à 100 : corrigé) |
| `timestamp` | ISO UTC ou `null` | |

**Manquant pour tracer les décisions** : `modelVersion` (version du pack de paramètres
ayant produit le score). À ajouter au modèle `risk_scores` quand l'équipe IA fixe le versionnage.

## Confidentialité (IA-05)

Chaque modèle ne doit utiliser que les données de l'enfant concerné. La tâche
`retrain` travaille enfant par enfant (`_retrain_single_child(db, child_id, positions)`).
**Test d'absence de fuite inter-enfants à écrire côté IA** dès que le pipeline est
exécutable en test (nécessite PostGIS) : « positions de l'enfant A ∉ entrée du modèle de B ».

## Validation (règle d'or CDC IA §6)

Aucun module n'est validé sur ses données d'apprentissage. Les tests fournis dans
`server/tests` couvrent la logique déterministe (hystérésis, concordance, triage de
télémétrie) ; ils ne mesurent **pas** la qualité d'un modèle (précision, rappel,
calibration, latence < 5 s) : ces mesures restent à produire sur scénarios
réservés, avec un jeu d'essai synthétique séparé train / validation / test.
