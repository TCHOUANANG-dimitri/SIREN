-- =============================================================================
-- SIREN — SCHÉMA DE LA BASE DE DONNÉES (PostgreSQL 15+ / PostGIS)
-- =============================================================================
-- Créé le 2026-07-29
-- Usage :
--   1. createdb siren
--   2. psql -d siren -f db_schema.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TYPES ÉNUMÉRÉS
-- =============================================================================
CREATE TYPE role_type AS ENUM ('principal', 'secondaire');
CREATE TYPE fix_quality AS ENUM ('gps_recent', 'estimee', 'perdu');
CREATE TYPE place_source AS ENUM ('declare', 'appris');
CREATE TYPE geofence_type AS ENUM ('autorise', 'interdit');
CREATE TYPE risk_state AS ENUM ('veille', 'prealerte', 'urgence', 'disparition');
CREATE TYPE alert_level AS ENUM ('prealerte', 'urgence');
CREATE TYPE alert_status AS ENUM ('active', 'acquittee', 'fausse', 'resolue');
CREATE TYPE share_status AS ENUM ('invite', 'actif', 'revoque');
CREATE TYPE device_event_type AS ENUM ('arrachement', 'signal_perdu', 'batterie_faible', 'reconnexion', 'reset');
CREATE TYPE permission_enum AS ENUM (
    'position_precise', 'etat_zone', 'alertes_prealerte',
    'alertes_urgence', 'historique', 'mobilisation'
);
CREATE TYPE platform_type AS ENUM ('fcm', 'apns');

-- =============================================================================
-- TABLE : users
-- =============================================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom             VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    telephone       VARCHAR(30),
    role            role_type NOT NULL DEFAULT 'principal',
    langue          VARCHAR(5) NOT NULL DEFAULT 'fr',
    twofa_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    twofa_secret    VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- =============================================================================
-- TABLE : refresh_tokens
-- =============================================================================
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- =============================================================================
-- TABLE : devices
-- =============================================================================
CREATE TABLE devices (
    device_id       VARCHAR(50) PRIMARY KEY,
    secret_key_hash VARCHAR(255) NOT NULL,
    config_version  INTEGER NOT NULL DEFAULT 1,
    firmware_version VARCHAR(30),
    last_seen       TIMESTAMPTZ,
    battery         SMALLINT CHECK (battery >= 0 AND battery <= 100),
    online          BOOLEAN NOT NULL DEFAULT FALSE,
    energy_mode     VARCHAR(20) NOT NULL DEFAULT 'normal',
    sensitivity     VARCHAR(20) NOT NULL DEFAULT 'normal',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_devices_online ON devices(online) WHERE online = TRUE;

-- =============================================================================
-- TABLE : children
-- =============================================================================
CREATE TABLE children (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prenom          VARCHAR(100) NOT NULL,
    photo_url       TEXT,
    parent_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id       VARCHAR(50) REFERENCES devices(device_id) ON DELETE SET NULL,
    model_confidence SMALLINT NOT NULL DEFAULT 0
                    CHECK (model_confidence >= 0 AND model_confidence <= 100),
    sleep_schedule  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_children_device ON children(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX idx_children_parent ON children(parent_id) WHERE deleted_at IS NULL;

-- =============================================================================
-- TABLE : positions (séries temporelles géospatiales)
-- =============================================================================
CREATE TABLE positions (
    id              BIGSERIAL,
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    geom            GEOMETRY(Point, 4326) NOT NULL,
    speed_kmh       REAL,
    accuracy_m      REAL,
    heading         REAL,
    fix_quality     fix_quality NOT NULL DEFAULT 'gps_recent',
    battery         SMALLINT,
    imu_data        JSONB,
    ts              TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (child_id, ts, id)
) PARTITION BY RANGE (ts);

-- Create partitions for positions (monthly)
CREATE TABLE positions_2026_06 PARTITION OF positions
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE positions_2026_07 PARTITION OF positions
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE positions_2026_08 PARTITION OF positions
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE positions_2026_09 PARTITION OF positions
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE positions_default PARTITION OF positions DEFAULT;

-- Indexes on positions
CREATE INDEX idx_positions_child_ts ON positions(child_id, ts DESC);
CREATE INDEX idx_positions_geom ON positions USING GIST (geom);

-- =============================================================================
-- TABLE : places
-- =============================================================================
CREATE TABLE places (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    nom             VARCHAR(150) NOT NULL,
    geom            GEOMETRY(Point, 4326) NOT NULL,
    radius_m        REAL NOT NULL DEFAULT 50,
    source          place_source NOT NULL DEFAULT 'declare',
    visit_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_places_child ON places(child_id);
CREATE INDEX idx_places_geom ON places USING GIST (geom);

-- =============================================================================
-- TABLE : place_schedules
-- =============================================================================
CREATE TABLE place_schedules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    place_id        UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    jours           INTEGER[] NOT NULL,
    heure_debut     TIME NOT NULL,
    heure_fin       TIME NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_place_schedule_jours CHECK (
        array_length(jours, 1) BETWEEN 1 AND 7
        AND jours <@ ARRAY[0,1,2,3,4,5,6]
    ),
    CONSTRAINT ck_place_schedule_hours CHECK (heure_debut < heure_fin)
);
CREATE INDEX idx_place_schedules_place ON place_schedules(place_id);

-- =============================================================================
-- TABLE : geofences
-- =============================================================================
CREATE TABLE geofences (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    nom             VARCHAR(150) NOT NULL,
    type            geofence_type NOT NULL DEFAULT 'interdit',
    geom            GEOMETRY(Geometry, 4326) NOT NULL,
    notify_enter    BOOLEAN NOT NULL DEFAULT TRUE,
    notify_exit     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_geofences_child ON geofences(child_id);
CREATE INDEX idx_geofences_geom ON geofences USING GIST (geom);

-- =============================================================================
-- TABLE : geofence_schedules (optionnel — plages horaires par geofence)
-- =============================================================================
CREATE TABLE geofence_schedules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    geofence_id     UUID NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
    jours           INTEGER[] NOT NULL,
    heure_debut     TIME NOT NULL,
    heure_fin       TIME NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_geofence_schedule_jours CHECK (
        array_length(jours, 1) BETWEEN 1 AND 7
        AND jours <@ ARRAY[0,1,2,3,4,5,6]
    ),
    CONSTRAINT ck_geofence_schedule_hours CHECK (heure_debut < heure_fin)
);
CREATE INDEX idx_geofence_schedules_fence ON geofence_schedules(geofence_id);

-- =============================================================================
-- TABLE : markov_models
-- =============================================================================
CREATE TABLE markov_models (
    child_id        UUID PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
    matrix          JSONB NOT NULL,
    places_ref      JSONB NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE : familiar_cells
-- =============================================================================
CREATE TABLE familiar_cells (
    id              BIGSERIAL PRIMARY KEY,
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    cell_id         VARCHAR(20) NOT NULL,
    weight          REAL NOT NULL DEFAULT 1.0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_familiar_cell UNIQUE (child_id, cell_id)
);
CREATE INDEX idx_familiar_cells_child ON familiar_cells(child_id);

-- =============================================================================
-- TABLE : hourly_profiles
-- =============================================================================
CREATE TABLE hourly_profiles (
    id              BIGSERIAL PRIMARY KEY,
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    place_id        UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    profile         JSONB NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hourly_profile UNIQUE (child_id, place_id)
);
CREATE INDEX idx_hourly_profiles_child ON hourly_profiles(child_id);

-- =============================================================================
-- TABLE : param_packs (packs versionnés redescendus au dispositif)
-- =============================================================================
CREATE TABLE param_packs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    payload         JSONB NOT NULL,
    validated       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_param_pack_child_version UNIQUE (child_id, version)
);
CREATE INDEX idx_param_packs_child ON param_packs(child_id, version DESC);

-- =============================================================================
-- TABLE : risk_scores
-- =============================================================================
CREATE TABLE risk_scores (
    id              BIGSERIAL PRIMARY KEY,
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    score           SMALLINT NOT NULL CHECK (score >= 0 AND score <= 100),
    state           risk_state NOT NULL DEFAULT 'veille',
    confidence      SMALLINT NOT NULL DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
    reasons         JSONB,
    sub_scores      JSONB,
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_risk_scores_child_ts ON risk_scores(child_id, ts DESC);

-- =============================================================================
-- TABLE : alerts
-- =============================================================================
CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    level           alert_level NOT NULL,
    score           SMALLINT NOT NULL CHECK (score >= 0 AND score <= 100),
    reasons         JSONB,
    geom            GEOMETRY(Point, 4326),
    status          alert_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);
CREATE INDEX idx_alerts_child ON alerts(child_id, created_at DESC);
CREATE INDEX idx_alerts_status ON alerts(status) WHERE status = 'active';

-- =============================================================================
-- TABLE : secondary_access (RBAC des secondaires)
-- =============================================================================
CREATE TABLE secondary_access (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permissions     permission_enum[] NOT NULL,
    status          share_status NOT NULL DEFAULT 'invite',
    invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at    TIMESTAMPTZ,
    CONSTRAINT uq_secondary_access UNIQUE (child_id, user_id)
);
CREATE INDEX idx_secondary_access_child ON secondary_access(child_id);
CREATE INDEX idx_secondary_access_user ON secondary_access(user_id);

-- =============================================================================
-- TABLE : access_audit (journal des consultations)
-- =============================================================================
CREATE TABLE access_audit (
    id              BIGSERIAL PRIMARY KEY,
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    info_type       VARCHAR(50) NOT NULL,
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_access_audit_child ON access_audit(child_id, ts DESC);

-- =============================================================================
-- TABLE : push_tokens
-- =============================================================================
CREATE TABLE push_tokens (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           TEXT NOT NULL,
    platform        platform_type NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_push_token UNIQUE (user_id, platform, token)
);
CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);

-- =============================================================================
-- TABLE : community_reports
-- =============================================================================
CREATE TABLE community_reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    secteur         VARCHAR(100),
    description     TEXT NOT NULL,
    geom            GEOMETRY(Point, 4326),
    moderated       BOOLEAN NOT NULL DEFAULT FALSE,
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_community_reports_geom ON community_reports USING GIST (geom);
CREATE INDEX idx_community_reports_ts ON community_reports(ts DESC);

-- =============================================================================
-- TABLE : emergency_contacts
-- =============================================================================
CREATE TABLE emergency_contacts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    nom             VARCHAR(150) NOT NULL,
    telephone       VARCHAR(30) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_emergency_contacts_child ON emergency_contacts(child_id);

-- =============================================================================
-- TABLE : audio_activations
-- =============================================================================
CREATE TABLE audio_activations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    requested_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason          TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    labels          JSONB
);
CREATE INDEX idx_audio_activations_child ON audio_activations(child_id, started_at DESC);

-- =============================================================================
-- TABLE : device_events
-- =============================================================================
CREATE TABLE device_events (
    id              BIGSERIAL PRIMARY KEY,
    device_id       VARCHAR(50) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    event_type      device_event_type NOT NULL,
    payload         JSONB,
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_device_events_device ON device_events(device_id, ts DESC);

-- =============================================================================
-- VUES
-- =============================================================================

-- Vue : positions courantes (dernière position par enfant)
CREATE OR REPLACE VIEW current_positions AS
SELECT DISTINCT ON (p.child_id)
    p.child_id,
    p.geom,
    p.speed_kmh,
    p.accuracy_m,
    p.heading,
    p.fix_quality,
    p.battery,
    p.ts as last_seen
FROM positions p
ORDER BY p.child_id, p.ts DESC;

-- Vue : résumé des alertes actives
CREATE OR REPLACE VIEW active_alerts_summary AS
SELECT
    a.id,
    a.child_id,
    c.prenom as child_name,
    a.level,
    a.score,
    a.reasons,
    ST_AsGeoJSON(a.geom)::jsonb as location,
    a.created_at
FROM alerts a
JOIN children c ON c.id = a.child_id
WHERE a.status = 'active'
ORDER BY a.score DESC;

-- Vue : score de risque courant par enfant
CREATE OR REPLACE VIEW latest_risk_scores AS
SELECT DISTINCT ON (rs.child_id)
    rs.child_id,
    rs.score,
    rs.state,
    rs.confidence,
    rs.reasons,
    rs.sub_scores,
    rs.ts
FROM risk_scores rs
ORDER BY rs.child_id, rs.ts DESC;

-- Vue : statistiques des dispositifs
CREATE OR REPLACE VIEW device_stats AS
SELECT
    d.device_id,
    d.online,
    d.battery,
    d.config_version,
    d.firmware_version,
    d.last_seen,
    c.id as child_id,
    c.prenom as child_name
FROM devices d
LEFT JOIN children c ON c.device_id = d.device_id;

-- =============================================================================
-- FONCTIONS ET TRIGGERS
-- =============================================================================

-- Trigger : mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_children_updated_at
    BEFORE UPDATE ON children
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_places_updated_at
    BEFORE UPDATE ON places
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_geofences_updated_at
    BEFORE UPDATE ON geofences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger : mise à jour last_seen et online du dispositif à l'insertion d'une position
CREATE OR REPLACE FUNCTION update_device_heartbeat()
RETURNS TRIGGER AS $$
DECLARE
    v_device_id VARCHAR(50);
BEGIN
    SELECT device_id INTO v_device_id FROM children WHERE id = NEW.child_id;
    IF v_device_id IS NOT NULL THEN
        UPDATE devices
        SET last_seen = NEW.ts,
            online = TRUE,
            battery = COALESCE(NEW.battery, battery)
        WHERE device_id = v_device_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_positions_device_heartbeat
    AFTER INSERT ON positions
    FOR EACH ROW EXECUTE FUNCTION update_device_heartbeat();

-- Trigger : alerte automatique si score dangereux
CREATE OR REPLACE FUNCTION auto_escalate_alert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.state IN ('prealerte', 'urgence') THEN
        INSERT INTO alerts (child_id, level, score, reasons, geom, status)
        VALUES (
            NEW.child_id,
            CASE WHEN NEW.state = 'urgence' THEN 'urgence'::alert_level
                 ELSE 'prealerte'::alert_level END,
            NEW.score,
            NEW.reasons,
            (SELECT geom FROM positions WHERE child_id = NEW.child_id ORDER BY ts DESC LIMIT 1),
            'active'
        )
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_risk_scores_auto_alert
    AFTER INSERT ON risk_scores
    FOR EACH ROW
    WHEN (NEW.state IN ('prealerte', 'urgence'))
    EXECUTE FUNCTION auto_escalate_alert();

-- Trigger : résolution automatique des alertes quand le score repasse en veille
CREATE OR REPLACE FUNCTION auto_resolve_alerts()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.state = 'veille' AND OLD.state IN ('prealerte', 'urgence') THEN
        UPDATE alerts
        SET status = 'resolue',
            resolved_at = NOW()
        WHERE child_id = NEW.child_id
          AND status = 'active';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_risk_scores_auto_resolve
    AFTER UPDATE ON risk_scores
    FOR EACH ROW
    WHEN (NEW.state = 'veille' AND OLD.state IN ('prealerte', 'urgence'))
    EXECUTE FUNCTION auto_resolve_alerts();

-- Trigger : journalisation des accès aux données sensibles (via fonction dédiée)
CREATE OR REPLACE FUNCTION log_sensitive_access()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO access_audit (child_id, user_id, info_type)
    VALUES (NEW.child_id, NEW.requested_by, 'audio_activation');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audio_activations_audit
    AFTER INSERT ON audio_activations
    FOR EACH ROW EXECUTE FUNCTION log_sensitive_access();

-- =============================================================================
-- FONCTIONS UTILITAIRES
-- =============================================================================

-- Vérifie si une position est dans un lieu connu
CREATE OR REPLACE FUNCTION is_in_place(
    p_geom GEOMETRY(Point, 4326),
    p_place_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_radius_m REAL;
BEGIN
    SELECT radius_m INTO v_radius_m FROM places WHERE id = p_place_id;
    RETURN ST_DWithin(p_geom::geography, (SELECT geom FROM places WHERE id = p_place_id)::geography, v_radius_m);
END;
$$ LANGUAGE plpgsql;

-- Calcule la distance entre deux points en mètres
CREATE OR REPLACE FUNCTION distance_m(
    p1 GEOMETRY(Point, 4326),
    p2 GEOMETRY(Point, 4326)
) RETURNS REAL AS $$
BEGIN
    RETURN ST_Distance(p1::geography, p2::geography);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- POLITIQUES DE RÉTENTION (nettoyage automatique)
-- =============================================================================
-- La purge est gérée par une tâche Celery planifiée, mais on définit
-- une fonction utilitaire pour supprimer les positions de plus de 90 jours.
CREATE OR REPLACE FUNCTION purge_old_positions(retention_days INTEGER DEFAULT 90)
RETURNS BIGINT AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_deleted BIGINT;
BEGIN
    v_cutoff := NOW() - (retention_days || ' days')::INTERVAL;
    DELETE FROM positions WHERE ts < v_cutoff;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- CONTRAINTES ADDITIONNELLES (hors clés étrangères)
-- =============================================================================
ALTER TABLE children
    ADD CONSTRAINT ck_children_photo_url CHECK (
        photo_url IS NULL OR photo_url ~ '^https?://'
    );

ALTER TABLE users
    ADD CONSTRAINT ck_users_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

ALTER TABLE community_reports
    ADD CONSTRAINT ck_community_report_description CHECK (length(description) >= 10);

-- =============================================================================
-- JEU DE DONNÉES DE DÉMONSTRATION (optionnel — décommenter si nécessaire)
-- =============================================================================
-- INSERT INTO users (id, nom, email, password_hash, telephone, role, langue)
-- VALUES
--     ('a0000000-0000-0000-0000-000000000001', 'Marie Dupont', 'marie@example.com',
--      '$2b$12$...hash...', '+237612345678', 'principal', 'fr'),
--     ('a0000000-0000-0000-0000-000000000002', 'Rose Ngono', 'rose@example.com',
--      '$2b$12$...hash...', '+237698765432', 'secondaire', 'fr');
--
-- INSERT INTO devices (device_id, secret_key_hash, firmware_version)
-- VALUES
--     ('SIREN-0001', '$2b$12$...device_key_hash...', '1.0.0'),
--     ('SIREN-0002', '$2b$12$...device_key_hash...', '1.0.0');
--
-- INSERT INTO children (id, prenom, parent_id, device_id)
-- VALUES
--     ('b0000000-0000-0000-0000-000000000001', 'Lea', 'a0000000-0000-0000-0000-000000000001', 'SIREN-0001'),
--     ('b0000000-0000-0000-0000-000000000002', 'Noah', 'a0000000-0000-0000-0000-000000000001', 'SIREN-0002');

COMMIT;
