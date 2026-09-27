# Contrat dispositif ↔ serveur — v1 (PROPOSITION À VALIDER)

> Le CDC Dispositif (13/09/2026) ne fixe ni format, ni fréquence, ni
> authentification (§6 « à définir »). Ce document décrit **ce que le serveur
> accepte aujourd'hui** (`server/app/api/v1/endpoints/device_ingestion.py`) afin
> que le pôle Dispositif puisse le valider ou le contester. Rien ici n'est
> imposé au matériel tant que le pôle ne l'a pas validé.

## Identité et authentification

| Élément | Aujourd'hui | Décision attendue |
|---|---|---|
| Identifiant | `deviceId` (ex. `SIREN-AB12-CD34`), imprimé / QR sur le boîtier | Format définitif, contenu du QR |
| Secret | `key` en clair dans chaque requête, vérifié contre `devices.secret_key_hash` (bcrypt) | Secret par boîtier provisionné en usine ? Rotation ? Stockage sur MCU ? |
| Appairage | Le parent saisit/scanne `deviceId` : **cela suffit** à revendiquer un boîtier non associé | **BLOQUANT sécurité** : ajouter un code d'appairage secret dans le QR (distinct de `key`) |

## Télémétrie — `POST /api/v1/device/v1/telemetry`

```json
{
  "deviceId": "SIREN-AB12-CD34",
  "key": "<secret boîtier>",
  "batch": [
    {
      "ts": "2026-09-27T08:00:00Z",
      "lat": 3.8667, "lon": 11.5167,
      "speed": 4.2,
      "accuracy": 12,
      "heading": 180,
      "battery": 81,
      "imu": { "accMax": 2.1 }
    }
  ]
}
```

| Champ | Unité / format | Obligatoire |
|---|---|---|
| `ts` | ISO 8601 **avec fuseau**, horloge du boîtier (GPS). Fait foi. | oui |
| `lat`, `lon` | WGS84 degrés décimaux | oui |
| `speed` | **km/h** | non |
| `accuracy` | mètres (HDOP converti) | non — absent ⇒ point « estimé » |
| `heading` | degrés, 0 = nord | non |
| `battery` | % 0–100 | non |
| `imu` | objet libre ; `accMax` en m/s² est exploité par le scoring | non |

Réponse : `{ "ack": true, "configVersion": <n> }`. Si `configVersion` dépasse
la version appliquée par le boîtier, il doit appeler `GET /pack`.

Robustesse côté serveur :

- **doublon** (même enfant + même `ts`, renvoi GSM) : ignoré, lot acquitté ;
- **retard / désordre** : points triés par `ts` ; un lot antérieur au dernier point connu
  complète l'historique sans recalculer le score « présent » ;
- **horodatage futur** (> 300 s, `TELEMETRY_MAX_FUTURE_SKEW_S`) ou illisible : point rejeté ;
- le boîtier est marqué `online`, `last_seen` et `battery` mis à jour à chaque lot.

## Configuration — `GET /api/v1/device/v1/pack?deviceId&key&have=<version>`

`304` si `have` ≥ version courante, sinon :

```json
{ "version": 7, "payload": { "…paramètres IA…": {}, "deviceConfig": { "version": 7, "energyMode": "equilibre", "sensitivity": "50" } } }
```

`energyMode` ∈ `continu | equilibre | economie` ; `sensitivity` = entier 0–100 (texte).
L'effet concret de chaque mode (période GPS, veille GSM) est **à définir par le pôle Dispositif**.

## Événements — `POST /api/v1/device/v1/event`

`{ "deviceId", "key", "type" }` avec `type` ∈ `removal`, `power_on`, `power_off`,
`low_battery`, `charging` (liste proposée). `power_off` passe le boîtier hors ligne.
**La réaction à `removal` (retrait) n'est pas définie** : décision IA / produit.

## Points ouverts (à trancher avec le pôle Dispositif)

1. Fréquence de capture et d'envoi (le produit facture 1 cycle / 30 min ; le boîtier peut capturer plus souvent, le serveur agrège).
2. Canal descendant pour « demander la position maintenant » (SMS ? réponse à la télémétrie ? BLE ?).
3. Caméra (photos au retrait) et micro : hors contrat v1, cadre juridique requis.
4. BLE (relais téléphone proche) : aucun échange défini.
5. Capteur cardiaque : **absent du matériel** alors que le CDC IA prévoit un module « anomalie cardiaque » (voir `docs/CDC-CONTRADICTIONS.md`).
6. Détection hors-ligne : aucune tâche ne repasse `online=false` après silence prolongé (à ajouter côté serveur, seuil à fixer).
