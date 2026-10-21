# Base de données SIREN — structure reconstituée

> Fichier de référence : `data/schema.sql` (identique à `server/db_schema.sql`),
> **généré** par `scripts/db/rebuild-schema.sh`. Ce document décrit ce schéma ;
> les tableaux de colonnes ont été produits depuis le catalogue d'une base
> PostgreSQL 15 / PostGIS 3.4 réellement créée à partir de `data/schema.sql`.

## 1. Sources et niveau de certitude

| Élément | Source | Statut |
|---|---|---|
| 22 tables métier, 11 types énumérés, 4 vues, fonctions, index, clés, contraintes, RLS | Sauvegarde Supabase `data/db_cluster-25-09-2026@17-41-07.backup.gz` (schéma `public`) | **Confirmé** (extraction automatique, restauration vérifiée) |
| Données | Même sauvegarde : **0 ligne** dans toutes les tables `public` et dans `auth.users` ; `data/…storage.zip` est une archive **vide** | **Confirmé** — aucune donnée à préserver ni à migrer |
| Colonnes / tables ajoutées par le serveur (`geofences.radius_m`, OTP, consentement…) | Migrations `server/migrations/001`, `002` (absentes de la sauvegarde : jamais appliquées en production) | **Confirmé** dans le code ; appliquées et testées sur une copie |
| Ajustements 003 (règles, partitions, triggers) | Analyse du code serveur, du CDC et du document « Couches déclarative + universelle » v1.0 | **Déduit** puis **vérifié** par tests sur base réelle |
| Signification de `familiar_cells.cell_id`, `hourly_profiles.profile`, `markov_models.matrix` | Code IA (`app/tasks/retrain.py`, `app/crud/ml_model.py`) | **Déduit** — format à confirmer par le pôle IA |
| Seuils métier (3 proches, 20 lieux/périmètres, 90 jours de rétention) | CDC App §4.5, `rules/declarative.py`, `POSITION_RETENTION_DAYS` | **Confirmé** dans le code ; durée de rétention **à valider** juridiquement |

Les sauvegardes `data/*.backup.gz` et `data/*.storage.zip` restent **hors Git**
(`.gitignore`) : une future sauvegarde contiendra des données personnelles,
notamment d'enfants.

## 2. Vue d'ensemble

- PostgreSQL ≥ 15, extensions **PostGIS**, **uuid-ossp**, **pgcrypto** installées dans
  le schéma `extensions` (convention Supabase) ; `search_path = public, extensions`.
- Identifiants : `uuid` (`uuid_generate_v4()`) pour les entités, `bigint` + séquence
  pour les journaux à fort volume (positions, scores, événements, audit, jetons push).
- Géométries : `geometry(Point, 4326)` (WGS84) ; distances calculées en mètres
  (`ST_DistanceSphere`, `distance_m()` en `geography`).
- Horodatages : `timestamptz` (UTC) partout ; horaires déclarés en `time` local
  (fuseau `Africa/Douala`, conversion côté serveur).
- **RLS activée sur les 44 tables (dont 20 partitions), sans politique** : l'API
  REST/anonyme de Supabase n'a accès à rien ; le serveur SIREN se connecte avec
  le rôle propriétaire (non soumis à la RLS).
- Suppression : douce pour `users` et `children` (`deleted_at`), en cascade pour
  toutes les données d'un enfant ou d'un utilisateur (clés étrangères `ON DELETE CASCADE`).

### Relations

```
users ─┬─< children ─┬─< positions (partitionnée par mois)
       │             ├─< risk_scores ─ (alerte créée par le serveur, pas par trigger)
       │             ├─< alerts
       │             ├─< places ─┬─< place_schedules
       │             │           └─< hourly_profiles >─ children
       │             ├─< geofences ─< geofence_schedules
       │             ├─< secondary_access >─ users      (proche invité)
       │             ├─< access_audit     >─ users      (consultations d'un proche)
       │             ├─< audio_activations >─ users     (demandeur)
       │             ├─< emergency_contacts
       │             ├─< familiar_cells, param_packs
       │             └── markov_models (1–1)
       │   children.device_id >── devices ─< device_events
       ├─< refresh_tokens, push_tokens, otp_challenges
       └─< community_reports (author_id, SET NULL)
```

`children.device_id` est unique (index partiel) : un dispositif n'est associé qu'à
un seul enfant ; supprimer le dispositif détache l'enfant (`SET NULL`).

## 3. Types énumérés

| Type | Valeurs |
|---|---|
| `alert_level` | `prealerte`, `urgence` |
| `alert_status` | `active`, `acquittee`, `fausse`, `resolue` |
| `device_event_type` | `arrachement`, `signal_perdu`, `batterie_faible`, `reconnexion`, `reset`, `allumage`, `extinction`, `en_charge`, `autre` |
| `fix_quality` | `gps_recent`, `estimee`, `perdu` |
| `geofence_type` | `autorise`, `interdit` |
| `permission_enum` | `position_precise`, `etat_zone`, `alertes_prealerte`, `alertes_urgence`, `historique`, `mobilisation` |
| `place_source` | `declare`, `appris` |
| `platform_type` | `fcm`, `apns` |
| `risk_state` | `veille`, `prealerte`, `urgence`, `disparition` |
| `role_type` | `principal`, `secondaire` |
| `share_status` | `invite`, `actif`, `revoque` |

## 4. Tables

Légende : **Null** = la colonne accepte NULL. PK clé primaire, FK clé étrangère.

### `access_audit`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `bigint` | non | `nextval('access_audit_id_seq'::regclass)` |
| `child_id` | `uuid` | non |  |
| `user_id` | `uuid` | non |  |
| `info_type` | `character varying(50)` | non |  |
| `ts` | `timestamp with time zone` | non | `now()` |

Contraintes :
- FK `access_audit_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- FK `access_audit_user_id_fkey` : `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- PK `access_audit_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_access_audit_child` : `btree (child_id, ts DESC)`

### `alerts`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `child_id` | `uuid` | non |  |
| `level` | `alert_level` | non |  |
| `score` | `smallint` | non |  |
| `reasons` | `jsonb` | oui |  |
| `geom` | `geometry(Point,4326)` | oui |  |
| `status` | `alert_status` | non | `'active'::alert_status` |
| `created_at` | `timestamp with time zone` | non | `now()` |
| `resolved_at` | `timestamp with time zone` | oui |  |

Contraintes :
- CHECK `alerts_score_check` : `CHECK (((score >= 0) AND (score <= 100)))`
- FK `alerts_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- PK `alerts_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_alerts_child` : `btree (child_id, created_at DESC)`
- `idx_alerts_status` : `btree (status) WHERE (status = 'active'::alert_status)`

### `audio_activations`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `child_id` | `uuid` | non |  |
| `requested_by` | `uuid` | non |  |
| `reason` | `text` | oui |  |
| `started_at` | `timestamp with time zone` | non | `now()` |
| `ended_at` | `timestamp with time zone` | oui |  |
| `labels` | `jsonb` | oui |  |

Contraintes :
- FK `audio_activations_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- FK `audio_activations_requested_by_fkey` : `FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE`
- PK `audio_activations_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_audio_activations_child` : `btree (child_id, started_at DESC)`

Triggers :
- `trg_audio_activations_audit` : AFTER INSERT → `log_sensitive_access()`

### `children`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `prenom` | `character varying(100)` | non |  |
| `photo_url` | `text` | oui |  |
| `parent_id` | `uuid` | non |  |
| `device_id` | `character varying(50)` | oui |  |
| `model_confidence` | `smallint` | non | `0` |
| `sleep_schedule` | `jsonb` | oui |  |
| `created_at` | `timestamp with time zone` | non | `now()` |
| `updated_at` | `timestamp with time zone` | non | `now()` |
| `deleted_at` | `timestamp with time zone` | oui |  |

Contraintes :
- CHECK `children_model_confidence_check` : `CHECK (((model_confidence >= 0) AND (model_confidence <= 100)))`
- CHECK `ck_children_photo_url` : `CHECK (((photo_url IS NULL) OR (photo_url ~ '^https?://'::text)))`
- FK `children_device_id_fkey` : `FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE SET NULL`
- FK `children_parent_id_fkey` : `FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE`
- PK `children_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_children_parent` : `btree (parent_id) WHERE (deleted_at IS NULL)`
- UNIQUE `uq_children_device` : `btree (device_id) WHERE (device_id IS NOT NULL)`

Triggers :
- `trg_children_updated_at` : BEFORE UPDATE → `update_updated_at()`

### `community_reports`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `author_id` | `uuid` | oui |  |
| `secteur` | `character varying(100)` | oui |  |
| `description` | `text` | non |  |
| `geom` | `geometry(Point,4326)` | oui |  |
| `moderated` | `boolean` | non | `false` |
| `ts` | `timestamp with time zone` | non | `now()` |

Contraintes :
- CHECK `ck_community_report_description` : `CHECK ((length(description) >= 10))`
- FK `community_reports_author_id_fkey` : `FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL`
- PK `community_reports_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_community_reports_geom` : `gist (geom)`
- `idx_community_reports_ts` : `btree (ts DESC)`

### `device_events`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `bigint` | non | `nextval('device_events_id_seq'::regclass)` |
| `device_id` | `character varying(50)` | non |  |
| `event_type` | `device_event_type` | non |  |
| `payload` | `jsonb` | oui |  |
| `ts` | `timestamp with time zone` | non | `now()` |

Contraintes :
- FK `device_events_device_id_fkey` : `FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE`
- PK `device_events_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_device_events_device` : `btree (device_id, ts DESC)`

### `devices`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `device_id` | `character varying(50)` | non |  |
| `secret_key_hash` | `character varying(255)` | non |  |
| `config_version` | `integer` | non | `1` |
| `firmware_version` | `character varying(30)` | oui |  |
| `last_seen` | `timestamp with time zone` | oui |  |
| `battery` | `smallint` | oui |  |
| `online` | `boolean` | non | `false` |
| `energy_mode` | `character varying(20)` | non | `'equilibre'::character varying` |
| `sensitivity` | `character varying(20)` | non | `'50'::character varying` |
| `created_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- CHECK `ck_devices_energy_mode` : `CHECK (((energy_mode)::text = ANY (ARRAY[('continu'::character varying)::text, ('equilibre'::character varying)::text, ('economie'::character varying)::text])))`
- CHECK `ck_devices_sensitivity` : `CHECK ((((sensitivity)::text ~ '^[0-9]{1,3}$'::text) AND (((sensitivity)::integer >= 0) AND ((sensitivity)::integer <= 100))))`
- CHECK `devices_battery_check` : `CHECK (((battery >= 0) AND (battery <= 100)))`
- PK `devices_pkey` : `PRIMARY KEY (device_id)`

Index :
- `idx_devices_online` : `btree (online) WHERE (online = true)`

### `emergency_contacts`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `child_id` | `uuid` | non |  |
| `nom` | `character varying(150)` | non |  |
| `telephone` | `character varying(30)` | non |  |
| `created_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- FK `emergency_contacts_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- PK `emergency_contacts_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_emergency_contacts_child` : `btree (child_id)`

### `familiar_cells`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `bigint` | non | `nextval('familiar_cells_id_seq'::regclass)` |
| `child_id` | `uuid` | non |  |
| `cell_id` | `character varying(20)` | non |  |
| `weight` | `real` | non | `1.0` |
| `updated_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- FK `familiar_cells_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- PK `familiar_cells_pkey` : `PRIMARY KEY (id)`
- UNIQUE `uq_familiar_cell` : `UNIQUE (child_id, cell_id)`

Index :
- `idx_familiar_cells_child` : `btree (child_id)`

### `geofence_schedules`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `geofence_id` | `uuid` | non |  |
| `jours` | `integer[]` | non |  |
| `heure_debut` | `time without time zone` | non |  |
| `heure_fin` | `time without time zone` | non |  |
| `created_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- CHECK `ck_geofence_schedule_hours` : `CHECK ((heure_debut < heure_fin))`
- CHECK `ck_geofence_schedule_jours` : `CHECK (((array_length(jours, 1) >= 1) AND (array_length(jours, 1) <= 7) AND (jours <@ ARRAY[0, 1, 2, 3, 4, 5, 6])))`
- FK `geofence_schedules_geofence_id_fkey` : `FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE CASCADE`
- PK `geofence_schedules_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_geofence_schedules_fence` : `btree (geofence_id)`

### `geofences`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `child_id` | `uuid` | non |  |
| `nom` | `character varying(150)` | non |  |
| `type` | `geofence_type` | non | `'interdit'::geofence_type` |
| `geom` | `geometry(Geometry,4326)` | non |  |
| `notify_enter` | `boolean` | non | `true` |
| `notify_exit` | `boolean` | non | `true` |
| `created_at` | `timestamp with time zone` | non | `now()` |
| `updated_at` | `timestamp with time zone` | non | `now()` |
| `radius_m` | `real` | non | `100` |

Contraintes :
- CHECK `geofences_radius_m_check` : `CHECK (((radius_m >= (10)::double precision) AND (radius_m <= (50000)::double precision)))`
- FK `geofences_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- PK `geofences_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_geofences_child` : `btree (child_id)`
- `idx_geofences_geom` : `gist (geom)`

Triggers :
- `trg_geofences_updated_at` : BEFORE UPDATE → `update_updated_at()`

### `hourly_profiles`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `bigint` | non | `nextval('hourly_profiles_id_seq'::regclass)` |
| `child_id` | `uuid` | non |  |
| `place_id` | `uuid` | non |  |
| `profile` | `jsonb` | non |  |
| `updated_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- FK `hourly_profiles_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- FK `hourly_profiles_place_id_fkey` : `FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE`
- PK `hourly_profiles_pkey` : `PRIMARY KEY (id)`
- UNIQUE `uq_hourly_profile` : `UNIQUE (child_id, place_id)`

Index :
- `idx_hourly_profiles_child` : `btree (child_id)`

### `markov_models`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `child_id` | `uuid` | non |  |
| `matrix` | `jsonb` | non |  |
| `places_ref` | `jsonb` | non |  |
| `updated_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- FK `markov_models_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- PK `markov_models_pkey` : `PRIMARY KEY (child_id)`

### `otp_challenges`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `user_id` | `uuid` | non |  |
| `purpose` | `character varying(20)` | non |  |
| `token_hash` | `character varying(64)` | non |  |
| `code_hash` | `character varying(64)` | non |  |
| `attempts` | `integer` | non | `0` |
| `expires_at` | `timestamp with time zone` | non |  |
| `consumed_at` | `timestamp with time zone` | oui |  |
| `created_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- CHECK `ck_otp_attempts` : `CHECK ((attempts >= 0))`
- CHECK `otp_challenges_purpose_check` : `CHECK (((purpose)::text = ANY (ARRAY[('signup_verify'::character varying)::text, ('login_2fa'::character varying)::text, ('password_reset'::character varying)::text])))`
- FK `otp_challenges_user_id_fkey` : `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- PK `otp_challenges_pkey` : `PRIMARY KEY (id)`
- UNIQUE `otp_challenges_token_hash_key` : `UNIQUE (token_hash)`

Index :
- `idx_otp_challenges_user_purpose` : `btree (user_id, purpose, created_at DESC)`

### `param_packs`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `child_id` | `uuid` | non |  |
| `version` | `integer` | non |  |
| `payload` | `jsonb` | non |  |
| `validated` | `boolean` | non | `false` |
| `created_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- FK `param_packs_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- PK `param_packs_pkey` : `PRIMARY KEY (id)`
- UNIQUE `uq_param_pack_child_version` : `UNIQUE (child_id, version)`

Index :
- `idx_param_packs_child` : `btree (child_id, version DESC)`

### `place_schedules`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `place_id` | `uuid` | non |  |
| `jours` | `integer[]` | non |  |
| `heure_debut` | `time without time zone` | non |  |
| `heure_fin` | `time without time zone` | non |  |
| `created_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- CHECK `ck_place_schedule_hours` : `CHECK ((heure_debut < heure_fin))`
- CHECK `ck_place_schedule_jours` : `CHECK (((array_length(jours, 1) >= 1) AND (array_length(jours, 1) <= 7) AND (jours <@ ARRAY[0, 1, 2, 3, 4, 5, 6])))`
- FK `place_schedules_place_id_fkey` : `FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE`
- PK `place_schedules_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_place_schedules_place` : `btree (place_id)`

### `places`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `child_id` | `uuid` | non |  |
| `nom` | `character varying(150)` | non |  |
| `geom` | `geometry(Point,4326)` | non |  |
| `radius_m` | `real` | non | `100` |
| `source` | `place_source` | non | `'declare'::place_source` |
| `visit_count` | `integer` | non | `0` |
| `created_at` | `timestamp with time zone` | non | `now()` |
| `updated_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- CHECK `ck_places_radius_m` : `CHECK (((radius_m >= (10)::double precision) AND (radius_m <= (50000)::double precision)))`
- FK `places_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- PK `places_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_places_child` : `btree (child_id)`
- `idx_places_geom` : `gist (geom)`

Triggers :
- `trg_places_updated_at` : BEFORE UPDATE → `update_updated_at()`

### `positions`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `bigint` | non | `nextval('positions_id_seq'::regclass)` |
| `child_id` | `uuid` | non |  |
| `geom` | `geometry(Point,4326)` | non |  |
| `speed_kmh` | `real` | oui |  |
| `accuracy_m` | `real` | oui |  |
| `heading` | `real` | oui |  |
| `fix_quality` | `fix_quality` | non | `'gps_recent'::fix_quality` |
| `battery` | `smallint` | oui |  |
| `imu_data` | `jsonb` | oui |  |
| `ts` | `timestamp with time zone` | non |  |
| `created_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- FK `positions_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- PK `positions_pkey` : `PRIMARY KEY (child_id, ts, id)`

Index :
- `idx_positions_child_ts` : `btree (child_id, ts DESC)`
- `idx_positions_geom` : `gist (geom)`

Triggers :
- `trg_positions_device_heartbeat` : AFTER INSERT → `update_device_heartbeat()`

### `push_tokens`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `bigint` | non | `nextval('push_tokens_id_seq'::regclass)` |
| `user_id` | `uuid` | non |  |
| `token` | `text` | non |  |
| `platform` | `platform_type` | non |  |
| `created_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- FK `push_tokens_user_id_fkey` : `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- PK `push_tokens_pkey` : `PRIMARY KEY (id)`
- UNIQUE `uq_push_token` : `UNIQUE (user_id, platform, token)`

Index :
- `idx_push_tokens_user` : `btree (user_id)`

### `refresh_tokens`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `user_id` | `uuid` | non |  |
| `token_hash` | `character varying(255)` | non |  |
| `expires_at` | `timestamp with time zone` | non |  |
| `revoked` | `boolean` | non | `false` |
| `created_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- FK `refresh_tokens_user_id_fkey` : `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- PK `refresh_tokens_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_refresh_tokens_hash` : `btree (token_hash)`
- `idx_refresh_tokens_user` : `btree (user_id)`

### `risk_scores`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `bigint` | non | `nextval('risk_scores_id_seq'::regclass)` |
| `child_id` | `uuid` | non |  |
| `score` | `smallint` | non |  |
| `state` | `risk_state` | non | `'veille'::risk_state` |
| `confidence` | `smallint` | non | `100` |
| `reasons` | `jsonb` | oui |  |
| `sub_scores` | `jsonb` | oui |  |
| `ts` | `timestamp with time zone` | non | `now()` |

Contraintes :
- CHECK `risk_scores_confidence_check` : `CHECK (((confidence >= 0) AND (confidence <= 100)))`
- CHECK `risk_scores_score_check` : `CHECK (((score >= 0) AND (score <= 100)))`
- FK `risk_scores_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- PK `risk_scores_pkey` : `PRIMARY KEY (id)`

Index :
- `idx_risk_scores_child_ts` : `btree (child_id, ts DESC)`

### `schema_migrations`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `version` | `character varying(10)` | non |  |
| `checksum` | `character(64)` | non |  |
| `applied_at` | `timestamp with time zone` | non | `now()` |

Contraintes :
- PK `schema_migrations_pkey` : `PRIMARY KEY (version)`

### `secondary_access`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `child_id` | `uuid` | non |  |
| `user_id` | `uuid` | non |  |
| `permissions` | `permission_enum[]` | non |  |
| `status` | `share_status` | non | `'invite'::share_status` |
| `invited_at` | `timestamp with time zone` | non | `now()` |
| `responded_at` | `timestamp with time zone` | oui |  |

Contraintes :
- FK `secondary_access_child_id_fkey` : `FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE`
- FK `secondary_access_user_id_fkey` : `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
- PK `secondary_access_pkey` : `PRIMARY KEY (id)`
- UNIQUE `uq_secondary_access` : `UNIQUE (child_id, user_id)`

Index :
- `idx_secondary_access_child` : `btree (child_id)`
- `idx_secondary_access_user` : `btree (user_id)`

Triggers :
- `trg_secondary_access_rules` : BEFORE INSERT OR UPDATE OF status, child_id, user_id → `enforce_secondary_access_rules()`

### `users`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| `id` | `uuid` | non | `uuid_generate_v4()` |
| `nom` | `character varying(150)` | non |  |
| `email` | `character varying(255)` | non |  |
| `password_hash` | `character varying(255)` | non |  |
| `telephone` | `character varying(30)` | oui |  |
| `role` | `role_type` | non | `'principal'::role_type` |
| `langue` | `character varying(5)` | non | `'fr'::character varying` |
| `twofa_enabled` | `boolean` | non | `false` |
| `twofa_secret` | `character varying(64)` | oui |  |
| `created_at` | `timestamp with time zone` | non | `now()` |
| `updated_at` | `timestamp with time zone` | non | `now()` |
| `deleted_at` | `timestamp with time zone` | oui |  |
| `email_verified_at` | `timestamp with time zone` | oui |  |
| `terms_version` | `character varying(20)` | oui |  |
| `privacy_version` | `character varying(20)` | oui |  |
| `legal_accepted_at` | `timestamp with time zone` | oui |  |

Contraintes :
- CHECK `ck_users_email` : `CHECK (((email)::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text))`
- CHECK `ck_users_langue` : `CHECK (((langue)::text = ANY (ARRAY[('fr'::character varying)::text, ('en'::character varying)::text])))`
- PK `users_pkey` : `PRIMARY KEY (id)`
- UNIQUE `users_email_key` : `UNIQUE (email)`

Index :
- `idx_users_email` : `btree (email) WHERE (deleted_at IS NULL)`

Triggers :
- `trg_users_updated_at` : BEFORE UPDATE → `update_updated_at()`

### `device_commands` (migration 004)

Commandes descendantes vers le traceur (protocole §8). `id` uuid, `device_id` → `devices`, `child_id` → `children`, `requested_by` → `users` (SET NULL), `code` ∈ `LOCALISER|MODE|REDEMARRER`, `valeur`, `status` ∈ `PENDING|SUCCESS|FAILED|TIMEOUT` (défaut PENDING), `detail`, `created_at`, `responded_at`. Index : (`child_id`, `created_at` DESC), PENDING par `created_at`. RLS activée.

### `device_relay_events` (migration 004)

Idempotence des trames relayées par un téléphone : `device_id`, `event_id` (empreinte SHA-256 de la trame), `relayed_by`, `received_at` ; `UNIQUE (device_id, event_id)`. RLS activée.

### `rate_limit_events` (migration 004)

Compteur de limitation de débit : `scope` (`login_account`, `login_ip`, `register_ip`, `forgot_ip`, `pair_fail`, `device_lookup`, `relay`, `device_cmd`, `password_check`), `key_hash` (HMAC, jamais la valeur), `created_at` ; index (`scope`, `key_hash`, `created_at` DESC) ; purge > 48 h. RLS activée.

Colonnes ajoutées aux tables existantes (004–005) : `users.telephone_verified_at`, `users.email` NULL autorisé ; `otp_challenges.channel`, `destination_hash`, `ip_hash`, `pending_value` ; `devices.activation_pin_hash` ; `positions.source`.

### Partitions de `positions`

`positions_2026_06`, `positions_2026_06_child_id_ts_idx`, `positions_2026_06_geom_idx`, `positions_2026_06_pkey`, `positions_2026_07`, `positions_2026_07_child_id_ts_idx`, `positions_2026_07_geom_idx`, `positions_2026_07_pkey`, `positions_2026_08`, `positions_2026_08_child_id_ts_idx`, `positions_2026_08_geom_idx`, `positions_2026_08_pkey`, `positions_2026_09`, `positions_2026_09_child_id_ts_idx`, `positions_2026_09_geom_idx`, `positions_2026_09_pkey`, `positions_2026_10`, `positions_2026_10_child_id_ts_idx`, `positions_2026_10_geom_idx`, `positions_2026_10_pkey`, `positions_2026_11`, `positions_2026_11_child_id_ts_idx`, `positions_2026_11_geom_idx`, `positions_2026_11_pkey`, `positions_2026_12`, `positions_2026_12_child_id_ts_idx`, `positions_2026_12_geom_idx`, `positions_2026_12_pkey`, `positions_2027_01`, `positions_2027_01_child_id_ts_idx`, `positions_2027_01_geom_idx`, `positions_2027_01_pkey`, `positions_2027_02`, `positions_2027_02_child_id_ts_idx`, `positions_2027_02_geom_idx`, `positions_2027_02_pkey`, `positions_2027_03`, `positions_2027_03_child_id_ts_idx`, `positions_2027_03_geom_idx`, `positions_2027_03_pkey`, `positions_2027_04`, `positions_2027_04_child_id_ts_idx`, `positions_2027_04_geom_idx`, `positions_2027_04_pkey`, `positions_2027_05`, `positions_2027_05_child_id_ts_idx`, `positions_2027_05_geom_idx`, `positions_2027_05_pkey`, `positions_2027_06`, `positions_2027_06_child_id_ts_idx`, `positions_2027_06_geom_idx`, `positions_2027_06_pkey`, `positions_2027_07`, `positions_2027_07_child_id_ts_idx`, `positions_2027_07_geom_idx`, `positions_2027_07_pkey`, `positions_2027_08`, `positions_2027_08_child_id_ts_idx`, `positions_2027_08_geom_idx`, `positions_2027_08_pkey`, `positions_2027_09`, `positions_2027_09_child_id_ts_idx`, `positions_2027_09_geom_idx`, `positions_2027_09_pkey`, `positions_2027_10`, `positions_2027_10_child_id_ts_idx`, `positions_2027_10_geom_idx`, `positions_2027_10_pkey`, `positions_2027_11`, `positions_2027_11_child_id_ts_idx`, `positions_2027_11_geom_idx`, `positions_2027_11_pkey`, `positions_2027_12`, `positions_2027_12_child_id_ts_idx`, `positions_2027_12_geom_idx`, `positions_2027_12_pkey`, `positions_default`, `positions_default_child_id_ts_idx`, `positions_default_geom_idx`, `positions_default_pkey`


## 5. Vues

| Vue | Contenu |
|---|---|
| `active_alerts_summary` | Alertes `active` avec le prénom de l'enfant et la position en GeoJSON, triées par score |
| `current_positions` | Dernière position connue de chaque enfant |
| `device_stats` | État des dispositifs et enfant associé |
| `latest_risk_scores` | Dernier score de chaque enfant |

## 6. Fonctions

| Fonction | Rôle |
|---|---|
| `distance_m(geometry, geometry) → real` | Distance en mètres (géographie) |
| `is_in_place(geometry, uuid) → boolean` | Point à l'intérieur du rayon d'un lieu |
| `purge_old_positions(retention_days default 90) → bigint` | Suppression des positions plus anciennes que la rétention |
| `create_positions_partition(date) → text` | Crée la partition mensuelle `positions_AAAA_MM` (RLS activée) |
| `ensure_positions_partitions(mois default 3) → integer` | Crée les partitions du mois courant et des N suivants — appelée le 1er du mois (Celery beat `ensure-positions-partitions`, ou `python run_tasks.py partitions` sur o2switch) |
| `update_updated_at()` | Trigger : met à jour `updated_at` |
| `update_device_heartbeat()` | Trigger : une position met à jour `devices.last_seen`, `online`, `battery` |
| `log_sensitive_access()` | Trigger : chaque activation audio est inscrite dans `access_audit` (`info_type = audio_activation`) |
| `enforce_secondary_access_rules()` | Trigger : 3 proches non révoqués maximum par enfant ; jamais le parent lui-même |

## 7. Règles métier et où elles sont garanties

| Règle | Base | Serveur | Application |
|---|---|---|---|
| 3 proches (invités ou actifs) max par enfant | trigger `trg_secondary_access_rules` (verrou par enfant) | `check_secondary_quota` → `409 secondary_limit` | bouton désactivé, message |
| Pas d'auto-partage | même trigger | `422 self_invite` (email/téléphone normalisés) | refus avant envoi |
| Un seul accès par (enfant, personne) | `UNIQUE uq_secondary_access` | ré-invitation = réactivation de la ligne | — |
| Score, confiance, batterie, modèle 0–100 | `CHECK` | — | jauges bornées |
| Rayon de périmètre 10–50 000 m, de lieu 10–50 000 m | `CHECK` | API : lieux 10–5 000 m | sélecteurs bornés |
| Rayon de lieu par défaut 100 m | `DEFAULT 100` | `DEFAULT_PLACE_RADIUS_M` | `DEFAULT_PLACE_RADIUS_M` |
| 20 lieux et 20 périmètres max par enfant | — | `400 place_limit` / `geofence_limit` | vérifié avant l'envoi |
| Créneau de lieu : début < fin, jours 0–6 (0 = dimanche) | `CHECK` | `422 schedule_invalid` / validation | vérifié dans l'assistant |
| Email valide et unique **si présent** (facultatif) ; langue `fr`/`en` | `CHECK`, `UNIQUE` | normalisation en minuscules ; jamais inventé | champ facultatif |
| Téléphone obligatoire (nouveaux comptes), E.164, unique parmi les comptes actifs | trigger `trg_users_require_telephone`, `ck_users_telephone_e164`, `uq_users_telephone_active` | `phonenumbers` → `422 phone_invalid`, `409 phone_taken` | validation E.164 avant envoi |
| Numéro de série `SIREN-XXXXX-XXXXX`, sensible à la casse, un seul enfant par boîtier | `ck_devices_serial_format`, `uq_children_device` | `422 serial_invalid`, `409 device_taken` | saisie formatée, QR strict |
| Commande : PENDING → SUCCESS/FAILED/TIMEOUT | `CHECK` sur `device_commands` | accusé signé, expiration 2 min | — |
| Trame relayée une seule fois | `UNIQUE uq_device_relay_event` | empreinte SHA-256 + ± 2 s | file locale dédoublonnée |
| Photo d'enfant : URL http(s) uniquement | `CHECK ck_children_photo_url` | validation 422 | photo locale conservée sur le téléphone |
| Mode d'énergie `continu`/`equilibre`/`economie`, sensibilité « 0 »–« 100 » | `CHECK` | validation | sélecteurs |
| Codes OTP : hachés, usage unique, essais ≥ 0 | `CHECK`, `UNIQUE token_hash` | expiration, 5 essais, cadence | — |
| Alerte uniquement à l'escalade (2 mesures, anti-clignotement) | (plus de trigger d'alerte automatique) | `should_raise_alert` + fusion | affichage des raisons |
| Rétention des positions | `purge_old_positions()` | tâche hebdomadaire | — |
| Une position appartient à une partition mensuelle | partitions + `ensure_positions_partitions` | tâche mensuelle | — |

## 8. Migrations

Appliquées dans l'ordre par `python server/migrations/apply.py` (service Docker
`migration`), suivies dans `schema_migrations` (version + empreinte SHA-256 ;
une migration modifiée après application est refusée). Toutes sont **idempotentes**
et **sans suppression de données**, rollback documenté en fin de fichier.

| Version | Contenu |
|---|---|
| 001 | `geofences.radius_m` ; défauts `devices.energy_mode = 'equilibre'`, `sensitivity = '50'` ; révocation des anciens refresh tokens bcrypt |
| 002 | Table `otp_challenges` ; `users.email_verified_at`, `terms_version`, `privacy_version`, `legal_accepted_at` |
| 003 | Valeurs `device_event_type` ; défaut 100 m des lieux ; suppression des triggers d'alerte automatique ; trigger de règles de partage ; contraintes de valeurs ; fonctions et partitions mensuelles 2026-10 → 2027-12 ; RLS sur `otp_challenges` |
| 004 | Téléphone : `users.email` facultatif, `telephone_verified_at`, `ck_users_telephone_e164` (NOT VALID), `uq_users_telephone_active`, trigger `trg_users_require_telephone` (INSERT). OTP : `channel`, `destination_hash`, `ip_hash`, `pending_value`, usages `phone_verify`/`phone_change`. Tables `rate_limit_events`, `device_commands`, `device_relay_events` (RLS). `devices.activation_pin_hash`, `ck_devices_serial_format` (NOT VALID, sensible à la casse). `create_positions_partition` en SECURITY DEFINER |
| 005 | `positions.source` (`device` \| `relay` \| `sms`, défaut `device`) |

- **Base neuve** (Docker) : `data/schema.sql` est exécuté à la création du volume
  et enregistre 001–005 ; `apply.py` ne rejoue rien.
- **Base de production Supabase** : `DATABASE_URL=… python server/migrations/apply.py`
  applique 001 → 003. Vérifié sur une restauration de la sauvegarde.

## 9. Ajustements réalisés (et pourquoi)

| Constat (vérifié sur base réelle) | Correction |
|---|---|
| Le serveur ne pouvait **écrire dans aucune table** : identifiants envoyés en `varchar` vers des colonnes `uuid` | Modèles SQLAlchemy en `UUID(as_uuid=False)` (`app/models/types.py`) |
| Énumérations : SQLAlchemy cherchait des types `alertlevel`, `sharestatus`… et envoyait les **noms** (`ACTIVE`) au lieu des **valeurs** (`active`) | `pg_enum()` : type nommé existant, valeurs en minuscules, jamais recréé |
| `secondary_access.permissions` déclaré `text[]` côté ORM | `permission_enum[]` |
| Les événements du dispositif acceptés par l'API (`low_battery`, `power_on`…) n'existaient pas dans `device_event_type` → erreur 500 | Valeurs ajoutées (003) + table de correspondance `DEVICE_EVENT_CODES` ; code inconnu → `autre` + `payload` |
| Horaires de lieu envoyés en texte vers des colonnes `time` → erreur 500 (lieux avec horaire, dont l'école) | Conversion `time` + validation début < fin |
| Ré-inviter un proche révoqué violait `uq_secondary_access` → erreur 500 | Réactivation de la ligne existante |
| Triggers `trg_risk_scores_auto_alert` : une alerte par score ≥ 30 (doublons, contraire à « 2 mesures pour confirmer ») ; `auto_resolve` jamais déclenché | Supprimés (003) : le serveur gère seul le cycle des alertes |
| Partitions de positions limitées à juin–septembre 2026 | Fonctions + partitions jusqu'à décembre 2027 + tâche mensuelle |
| Photo locale (`file://`) envoyée par l'app → violation `ck_children_photo_url` | Validation serveur (422) ; l'app garde la photo sur le téléphone |
| `places.radius_m` par défaut 50 m alors que la règle déclarative fixe 100 m | Défaut 100 m (base, API, app) |
| Le service Docker `migration` lançait Alembic **sans aucune version** (no-op) | Exécuteur SQL `migrations/apply.py` |

## 10. Incertitudes et points à valider

- **Production** : la sauvegarde date du 25/09/2026 ; si des données ont été écrites
  depuis, refaire une sauvegarde avant `apply.py` (les migrations ne suppriment rien,
  mais une partition mensuelle ne peut pas être créée si `positions_default`
  contient déjà des lignes de ce mois : les déplacer d'abord).
- **Pôle IA** : format de `markov_models.matrix`, `familiar_cells.cell_id`,
  `hourly_profiles.profile` et `param_packs.payload` (JSON libre côté base).
- **Pôle Dispositif** : liste définitive des événements (`DEVICE_EVENT_CODES`) ;
  `devices.secret_key_hash` est un bcrypt de la clé du dispositif.
- **Juridique** : durée de rétention des positions (90 j) et du journal d'accès
  (aucune purge aujourd'hui).
- `users.email` est unique y compris pour les comptes supprimés (suppression douce) :
  une adresse supprimée ne peut pas être réutilisée — choix à confirmer.
- `community_reports` n'a pas de colonne de modérateur ni de date de modération.
