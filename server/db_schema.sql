-- =============================================================================
-- SIREN — Schéma PostgreSQL / PostGIS reconstitué (base « siren »)
--
-- Source : sauvegarde Supabase du 25/09/2026 (data/*.backup.gz, schéma public,
-- AUCUNE donnée) + migrations server/migrations/NNN_*.sql.
-- GÉNÉRÉ par scripts/db/rebuild-schema.sh (pg_dump --schema-only) : ne pas
-- modifier à la main — ajouter une migration puis régénérer.
-- Documentation complète : data/SCHEMA.md.
--
-- Usage : base NEUVE uniquement (PostgreSQL >= 15, PostGIS >= 3.4)
--   psql -v ON_ERROR_STOP=1 -d siren -f data/schema.sql
-- Base existante : python server/migrations/apply.py
-- =============================================================================

-- Extensions dans le schéma « extensions » (convention Supabase, conservée pour
-- que la même définition serve en production et en conteneur).
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
    -- L'image postgis/postgis installe PostGIS dans « public » à la création de la base.
    -- Sur une base encore vide, on le réinstalle dans « extensions » (PostGIS n'est pas relocalisable).
    IF EXISTS (
        SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = 'postgis' AND n.nspname <> 'extensions'
    ) THEN
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys') THEN
            RAISE EXCEPTION 'PostGIS est installé hors du schéma extensions sur une base non vide : utiliser server/migrations/apply.py';
        END IF;
        DROP EXTENSION IF EXISTS postgis_tiger_geocoder CASCADE;
        DROP EXTENSION IF EXISTS postgis_topology CASCADE;
        DROP EXTENSION IF EXISTS fuzzystrmatch CASCADE;
        DROP EXTENSION IF EXISTS postgis CASCADE;
    END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Le code serveur appelle ST_*, uuid_generate_v4()… sans préfixe de schéma.
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET search_path = public, extensions', current_database());
EXCEPTION WHEN insufficient_privilege THEN
    -- Supabase : le search_path inclut déjà « extensions » ; droit non nécessaire.
    RAISE NOTICE 'search_path de la base non modifié (droits insuffisants)';
END $$;
SET search_path = public, extensions;

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8 (Debian 15.8-1.pgdg110+1)
-- Dumped by pg_dump version 15.8 (Debian 15.8-1.pgdg110+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: alert_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alert_level AS ENUM (
    'prealerte',
    'urgence'
);


--
-- Name: alert_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alert_status AS ENUM (
    'active',
    'acquittee',
    'fausse',
    'resolue'
);


--
-- Name: device_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.device_event_type AS ENUM (
    'arrachement',
    'signal_perdu',
    'batterie_faible',
    'reconnexion',
    'reset',
    'allumage',
    'extinction',
    'en_charge',
    'autre'
);


--
-- Name: fix_quality; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fix_quality AS ENUM (
    'gps_recent',
    'estimee',
    'perdu'
);


--
-- Name: geofence_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.geofence_type AS ENUM (
    'autorise',
    'interdit'
);


--
-- Name: permission_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.permission_enum AS ENUM (
    'position_precise',
    'etat_zone',
    'alertes_prealerte',
    'alertes_urgence',
    'historique',
    'mobilisation'
);


--
-- Name: place_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.place_source AS ENUM (
    'declare',
    'appris'
);


--
-- Name: platform_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.platform_type AS ENUM (
    'fcm',
    'apns'
);


--
-- Name: risk_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.risk_state AS ENUM (
    'veille',
    'prealerte',
    'urgence',
    'disparition'
);


--
-- Name: role_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role_type AS ENUM (
    'principal',
    'secondaire'
);


--
-- Name: share_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.share_status AS ENUM (
    'invite',
    'actif',
    'revoque'
);


--
-- Name: create_positions_partition(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_positions_partition(p_month date) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_start date := date_trunc('month', p_month)::date;
    v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
    v_name text := format('positions_%s', to_char(v_start, 'YYYY_MM'));
BEGIN
    IF to_regclass('public.' || v_name) IS NULL THEN
        -- Échoue (sans rien modifier) si positions_default contient déjà des lignes
        -- de ce mois : elles doivent d'abord être déplacées (voir data/SCHEMA.md).
        EXECUTE format(
            'CREATE TABLE public.%I PARTITION OF public.positions FOR VALUES FROM (%L) TO (%L)',
            v_name, v_start, v_end
        );
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_name);
    END IF;
    RETURN v_name;
END;
$$;


--
-- Name: distance_m(extensions.geometry, extensions.geometry); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.distance_m(p1 extensions.geometry, p2 extensions.geometry) RETURNS real
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN ST_Distance(p1::geography, p2::geography);
END;
$$;


--
-- Name: enforce_secondary_access_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_secondary_access_rules() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_parent uuid;
    v_count integer;
BEGIN
    SELECT parent_id INTO v_parent FROM public.children WHERE id = NEW.child_id;
    IF v_parent = NEW.user_id THEN
        RAISE EXCEPTION 'self_invite: le parent principal ne peut pas être son propre proche'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status <> 'revoque' THEN
        -- Sérialise les créations concurrentes pour un même enfant.
        PERFORM pg_advisory_xact_lock(hashtext(NEW.child_id::text));
        SELECT count(*) INTO v_count
          FROM public.secondary_access
         WHERE child_id = NEW.child_id
           AND status <> 'revoque'
           AND id <> NEW.id;
        IF v_count >= 3 THEN
            RAISE EXCEPTION 'secondary_limit: 3 proches maximum par enfant'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: ensure_positions_partitions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_positions_partitions(p_months_ahead integer DEFAULT 3) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_i integer;
BEGIN
    FOR v_i IN 0..p_months_ahead LOOP
        PERFORM public.create_positions_partition((date_trunc('month', now()) + make_interval(months => v_i))::date);
    END LOOP;
    RETURN p_months_ahead + 1;
END;
$$;


--
-- Name: is_in_place(extensions.geometry, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_in_place(p_geom extensions.geometry, p_place_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_radius_m REAL;
BEGIN
    SELECT radius_m INTO v_radius_m FROM places WHERE id = p_place_id;
    RETURN ST_DWithin(p_geom::geography, (SELECT geom FROM places WHERE id = p_place_id)::geography, v_radius_m);
END;
$$;


--
-- Name: log_sensitive_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_sensitive_access() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO access_audit (child_id, user_id, info_type)
    VALUES (NEW.child_id, NEW.requested_by, 'audio_activation');
    RETURN NEW;
END;
$$;


--
-- Name: purge_old_positions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_old_positions(retention_days integer DEFAULT 90) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_deleted BIGINT;
BEGIN
    v_cutoff := NOW() - (retention_days || ' days')::INTERVAL;
    DELETE FROM positions WHERE ts < v_cutoff;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;


--
-- Name: update_device_heartbeat(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_device_heartbeat() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_audit (
    id bigint NOT NULL,
    child_id uuid NOT NULL,
    user_id uuid NOT NULL,
    info_type character varying(50) NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: access_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.access_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: access_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.access_audit_id_seq OWNED BY public.access_audit.id;


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    child_id uuid NOT NULL,
    level public.alert_level NOT NULL,
    score smallint NOT NULL,
    reasons jsonb,
    geom extensions.geometry(Point,4326),
    status public.alert_status DEFAULT 'active'::public.alert_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT alerts_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- Name: children; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.children (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    prenom character varying(100) NOT NULL,
    photo_url text,
    parent_id uuid NOT NULL,
    device_id character varying(50),
    model_confidence smallint DEFAULT 0 NOT NULL,
    sleep_schedule jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT children_model_confidence_check CHECK (((model_confidence >= 0) AND (model_confidence <= 100))),
    CONSTRAINT ck_children_photo_url CHECK (((photo_url IS NULL) OR (photo_url ~ '^https?://'::text)))
);


--
-- Name: active_alerts_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_alerts_summary AS
 SELECT a.id,
    a.child_id,
    c.prenom AS child_name,
    a.level,
    a.score,
    a.reasons,
    (extensions.st_asgeojson(a.geom))::jsonb AS location,
    a.created_at
   FROM (public.alerts a
     JOIN public.children c ON ((c.id = a.child_id)))
  WHERE (a.status = 'active'::public.alert_status)
  ORDER BY a.score DESC;


--
-- Name: audio_activations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audio_activations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    child_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    reason text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    labels jsonb
);


--
-- Name: community_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_reports (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    author_id uuid,
    secteur character varying(100),
    description text NOT NULL,
    geom extensions.geometry(Point,4326),
    moderated boolean DEFAULT false NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_community_report_description CHECK ((length(description) >= 10))
);


--
-- Name: positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions (
    id bigint NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
)
PARTITION BY RANGE (ts);


--
-- Name: current_positions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.current_positions AS
 SELECT DISTINCT ON (p.child_id) p.child_id,
    p.geom,
    p.speed_kmh,
    p.accuracy_m,
    p.heading,
    p.fix_quality,
    p.battery,
    p.ts AS last_seen
   FROM public.positions p
  ORDER BY p.child_id, p.ts DESC;


--
-- Name: device_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_events (
    id bigint NOT NULL,
    device_id character varying(50) NOT NULL,
    event_type public.device_event_type NOT NULL,
    payload jsonb,
    ts timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: device_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.device_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: device_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.device_events_id_seq OWNED BY public.device_events.id;


--
-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    device_id character varying(50) NOT NULL,
    secret_key_hash character varying(255) NOT NULL,
    config_version integer DEFAULT 1 NOT NULL,
    firmware_version character varying(30),
    last_seen timestamp with time zone,
    battery smallint,
    online boolean DEFAULT false NOT NULL,
    energy_mode character varying(20) DEFAULT 'equilibre'::character varying NOT NULL,
    sensitivity character varying(20) DEFAULT '50'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_devices_energy_mode CHECK (((energy_mode)::text = ANY ((ARRAY['continu'::character varying, 'equilibre'::character varying, 'economie'::character varying])::text[]))),
    CONSTRAINT ck_devices_sensitivity CHECK ((((sensitivity)::text ~ '^[0-9]{1,3}$'::text) AND (((sensitivity)::integer >= 0) AND ((sensitivity)::integer <= 100)))),
    CONSTRAINT devices_battery_check CHECK (((battery >= 0) AND (battery <= 100)))
);


--
-- Name: device_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.device_stats AS
 SELECT d.device_id,
    d.online,
    d.battery,
    d.config_version,
    d.firmware_version,
    d.last_seen,
    c.id AS child_id,
    c.prenom AS child_name
   FROM (public.devices d
     LEFT JOIN public.children c ON (((c.device_id)::text = (d.device_id)::text)));


--
-- Name: emergency_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emergency_contacts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    child_id uuid NOT NULL,
    nom character varying(150) NOT NULL,
    telephone character varying(30) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: familiar_cells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.familiar_cells (
    id bigint NOT NULL,
    child_id uuid NOT NULL,
    cell_id character varying(20) NOT NULL,
    weight real DEFAULT 1.0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: familiar_cells_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.familiar_cells_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: familiar_cells_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.familiar_cells_id_seq OWNED BY public.familiar_cells.id;


--
-- Name: geofence_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geofence_schedules (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    geofence_id uuid NOT NULL,
    jours integer[] NOT NULL,
    heure_debut time without time zone NOT NULL,
    heure_fin time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_geofence_schedule_hours CHECK ((heure_debut < heure_fin)),
    CONSTRAINT ck_geofence_schedule_jours CHECK (((array_length(jours, 1) >= 1) AND (array_length(jours, 1) <= 7) AND (jours <@ ARRAY[0, 1, 2, 3, 4, 5, 6])))
);


--
-- Name: geofences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geofences (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    child_id uuid NOT NULL,
    nom character varying(150) NOT NULL,
    type public.geofence_type DEFAULT 'interdit'::public.geofence_type NOT NULL,
    geom extensions.geometry(Geometry,4326) NOT NULL,
    notify_enter boolean DEFAULT true NOT NULL,
    notify_exit boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    radius_m real DEFAULT 100 NOT NULL,
    CONSTRAINT geofences_radius_m_check CHECK (((radius_m >= (10)::double precision) AND (radius_m <= (50000)::double precision)))
);


--
-- Name: hourly_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hourly_profiles (
    id bigint NOT NULL,
    child_id uuid NOT NULL,
    place_id uuid NOT NULL,
    profile jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hourly_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hourly_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hourly_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hourly_profiles_id_seq OWNED BY public.hourly_profiles.id;


--
-- Name: risk_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_scores (
    id bigint NOT NULL,
    child_id uuid NOT NULL,
    score smallint NOT NULL,
    state public.risk_state DEFAULT 'veille'::public.risk_state NOT NULL,
    confidence smallint DEFAULT 100 NOT NULL,
    reasons jsonb,
    sub_scores jsonb,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT risk_scores_confidence_check CHECK (((confidence >= 0) AND (confidence <= 100))),
    CONSTRAINT risk_scores_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- Name: latest_risk_scores; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.latest_risk_scores AS
 SELECT DISTINCT ON (rs.child_id) rs.child_id,
    rs.score,
    rs.state,
    rs.confidence,
    rs.reasons,
    rs.sub_scores,
    rs.ts
   FROM public.risk_scores rs
  ORDER BY rs.child_id, rs.ts DESC;


--
-- Name: markov_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.markov_models (
    child_id uuid NOT NULL,
    matrix jsonb NOT NULL,
    places_ref jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: otp_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_challenges (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    purpose character varying(20) NOT NULL,
    token_hash character varying(64) NOT NULL,
    code_hash character varying(64) NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_otp_attempts CHECK ((attempts >= 0)),
    CONSTRAINT otp_challenges_purpose_check CHECK (((purpose)::text = ANY ((ARRAY['signup_verify'::character varying, 'login_2fa'::character varying, 'password_reset'::character varying])::text[])))
);


--
-- Name: param_packs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.param_packs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    child_id uuid NOT NULL,
    version integer NOT NULL,
    payload jsonb NOT NULL,
    validated boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: place_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_schedules (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    place_id uuid NOT NULL,
    jours integer[] NOT NULL,
    heure_debut time without time zone NOT NULL,
    heure_fin time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_place_schedule_hours CHECK ((heure_debut < heure_fin)),
    CONSTRAINT ck_place_schedule_jours CHECK (((array_length(jours, 1) >= 1) AND (array_length(jours, 1) <= 7) AND (jours <@ ARRAY[0, 1, 2, 3, 4, 5, 6])))
);


--
-- Name: places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.places (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    child_id uuid NOT NULL,
    nom character varying(150) NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    radius_m real DEFAULT 100 NOT NULL,
    source public.place_source DEFAULT 'declare'::public.place_source NOT NULL,
    visit_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_places_radius_m CHECK (((radius_m >= (10)::double precision) AND (radius_m <= (50000)::double precision)))
);


--
-- Name: positions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.positions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: positions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.positions_id_seq OWNED BY public.positions.id;


--
-- Name: positions_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2026_06 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2026_07 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2026_08 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2026_09 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2026_10 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2026_11 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2026_12 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_01 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_02 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_03 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_04 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_05 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_06 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_07 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_08 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_09 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_10 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_11 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_2027_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_2027_12 (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: positions_default; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_default (
    id bigint DEFAULT nextval('public.positions_id_seq'::regclass) NOT NULL,
    child_id uuid NOT NULL,
    geom extensions.geometry(Point,4326) NOT NULL,
    speed_kmh real,
    accuracy_m real,
    heading real,
    fix_quality public.fix_quality DEFAULT 'gps_recent'::public.fix_quality NOT NULL,
    battery smallint,
    imu_data jsonb,
    ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform public.platform_type NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_tokens_id_seq OWNED BY public.push_tokens.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: risk_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.risk_scores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: risk_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.risk_scores_id_seq OWNED BY public.risk_scores.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying(10) NOT NULL,
    checksum character(64) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: secondary_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secondary_access (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    child_id uuid NOT NULL,
    user_id uuid NOT NULL,
    permissions public.permission_enum[] NOT NULL,
    status public.share_status DEFAULT 'invite'::public.share_status NOT NULL,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    nom character varying(150) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    telephone character varying(30),
    role public.role_type DEFAULT 'principal'::public.role_type NOT NULL,
    langue character varying(5) DEFAULT 'fr'::character varying NOT NULL,
    twofa_enabled boolean DEFAULT false NOT NULL,
    twofa_secret character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    email_verified_at timestamp with time zone,
    terms_version character varying(20),
    privacy_version character varying(20),
    legal_accepted_at timestamp with time zone,
    CONSTRAINT ck_users_email CHECK (((email)::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)),
    CONSTRAINT ck_users_langue CHECK (((langue)::text = ANY ((ARRAY['fr'::character varying, 'en'::character varying])::text[])))
);


--
-- Name: positions_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');


--
-- Name: positions_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');


--
-- Name: positions_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');


--
-- Name: positions_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');


--
-- Name: positions_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');


--
-- Name: positions_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: positions_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: positions_2027_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_01 FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');


--
-- Name: positions_2027_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_02 FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');


--
-- Name: positions_2027_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_03 FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');


--
-- Name: positions_2027_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_04 FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');


--
-- Name: positions_2027_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_05 FOR VALUES FROM ('2027-05-01 00:00:00+00') TO ('2027-06-01 00:00:00+00');


--
-- Name: positions_2027_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_06 FOR VALUES FROM ('2027-06-01 00:00:00+00') TO ('2027-07-01 00:00:00+00');


--
-- Name: positions_2027_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_07 FOR VALUES FROM ('2027-07-01 00:00:00+00') TO ('2027-08-01 00:00:00+00');


--
-- Name: positions_2027_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_08 FOR VALUES FROM ('2027-08-01 00:00:00+00') TO ('2027-09-01 00:00:00+00');


--
-- Name: positions_2027_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_09 FOR VALUES FROM ('2027-09-01 00:00:00+00') TO ('2027-10-01 00:00:00+00');


--
-- Name: positions_2027_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_10 FOR VALUES FROM ('2027-10-01 00:00:00+00') TO ('2027-11-01 00:00:00+00');


--
-- Name: positions_2027_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_11 FOR VALUES FROM ('2027-11-01 00:00:00+00') TO ('2027-12-01 00:00:00+00');


--
-- Name: positions_2027_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_2027_12 FOR VALUES FROM ('2027-12-01 00:00:00+00') TO ('2028-01-01 00:00:00+00');


--
-- Name: positions_default; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ATTACH PARTITION public.positions_default DEFAULT;


--
-- Name: access_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_audit ALTER COLUMN id SET DEFAULT nextval('public.access_audit_id_seq'::regclass);


--
-- Name: device_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_events ALTER COLUMN id SET DEFAULT nextval('public.device_events_id_seq'::regclass);


--
-- Name: familiar_cells id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familiar_cells ALTER COLUMN id SET DEFAULT nextval('public.familiar_cells_id_seq'::regclass);


--
-- Name: hourly_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hourly_profiles ALTER COLUMN id SET DEFAULT nextval('public.hourly_profiles_id_seq'::regclass);


--
-- Name: positions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ALTER COLUMN id SET DEFAULT nextval('public.positions_id_seq'::regclass);


--
-- Name: push_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens ALTER COLUMN id SET DEFAULT nextval('public.push_tokens_id_seq'::regclass);


--
-- Name: risk_scores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_scores ALTER COLUMN id SET DEFAULT nextval('public.risk_scores_id_seq'::regclass);


--
-- Name: access_audit access_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_audit
    ADD CONSTRAINT access_audit_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: audio_activations audio_activations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_activations
    ADD CONSTRAINT audio_activations_pkey PRIMARY KEY (id);


--
-- Name: children children_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.children
    ADD CONSTRAINT children_pkey PRIMARY KEY (id);


--
-- Name: community_reports community_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_reports
    ADD CONSTRAINT community_reports_pkey PRIMARY KEY (id);


--
-- Name: device_events device_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_events
    ADD CONSTRAINT device_events_pkey PRIMARY KEY (id);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (device_id);


--
-- Name: emergency_contacts emergency_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_contacts
    ADD CONSTRAINT emergency_contacts_pkey PRIMARY KEY (id);


--
-- Name: familiar_cells familiar_cells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familiar_cells
    ADD CONSTRAINT familiar_cells_pkey PRIMARY KEY (id);


--
-- Name: geofence_schedules geofence_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_schedules
    ADD CONSTRAINT geofence_schedules_pkey PRIMARY KEY (id);


--
-- Name: geofences geofences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofences
    ADD CONSTRAINT geofences_pkey PRIMARY KEY (id);


--
-- Name: hourly_profiles hourly_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hourly_profiles
    ADD CONSTRAINT hourly_profiles_pkey PRIMARY KEY (id);


--
-- Name: markov_models markov_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markov_models
    ADD CONSTRAINT markov_models_pkey PRIMARY KEY (child_id);


--
-- Name: otp_challenges otp_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_challenges
    ADD CONSTRAINT otp_challenges_pkey PRIMARY KEY (id);


--
-- Name: otp_challenges otp_challenges_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_challenges
    ADD CONSTRAINT otp_challenges_token_hash_key UNIQUE (token_hash);


--
-- Name: param_packs param_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.param_packs
    ADD CONSTRAINT param_packs_pkey PRIMARY KEY (id);


--
-- Name: place_schedules place_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_schedules
    ADD CONSTRAINT place_schedules_pkey PRIMARY KEY (id);


--
-- Name: places places_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_pkey PRIMARY KEY (id);


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2026_06 positions_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2026_06
    ADD CONSTRAINT positions_2026_06_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2026_07 positions_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2026_07
    ADD CONSTRAINT positions_2026_07_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2026_08 positions_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2026_08
    ADD CONSTRAINT positions_2026_08_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2026_09 positions_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2026_09
    ADD CONSTRAINT positions_2026_09_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2026_10 positions_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2026_10
    ADD CONSTRAINT positions_2026_10_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2026_11 positions_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2026_11
    ADD CONSTRAINT positions_2026_11_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2026_12 positions_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2026_12
    ADD CONSTRAINT positions_2026_12_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_01 positions_2027_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_01
    ADD CONSTRAINT positions_2027_01_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_02 positions_2027_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_02
    ADD CONSTRAINT positions_2027_02_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_03 positions_2027_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_03
    ADD CONSTRAINT positions_2027_03_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_04 positions_2027_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_04
    ADD CONSTRAINT positions_2027_04_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_05 positions_2027_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_05
    ADD CONSTRAINT positions_2027_05_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_06 positions_2027_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_06
    ADD CONSTRAINT positions_2027_06_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_07 positions_2027_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_07
    ADD CONSTRAINT positions_2027_07_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_08 positions_2027_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_08
    ADD CONSTRAINT positions_2027_08_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_09 positions_2027_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_09
    ADD CONSTRAINT positions_2027_09_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_10 positions_2027_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_10
    ADD CONSTRAINT positions_2027_10_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_11 positions_2027_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_11
    ADD CONSTRAINT positions_2027_11_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_2027_12 positions_2027_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_2027_12
    ADD CONSTRAINT positions_2027_12_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: positions_default positions_default_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_default
    ADD CONSTRAINT positions_default_pkey PRIMARY KEY (child_id, ts, id);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: risk_scores risk_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_scores
    ADD CONSTRAINT risk_scores_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: secondary_access secondary_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secondary_access
    ADD CONSTRAINT secondary_access_pkey PRIMARY KEY (id);


--
-- Name: familiar_cells uq_familiar_cell; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familiar_cells
    ADD CONSTRAINT uq_familiar_cell UNIQUE (child_id, cell_id);


--
-- Name: hourly_profiles uq_hourly_profile; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hourly_profiles
    ADD CONSTRAINT uq_hourly_profile UNIQUE (child_id, place_id);


--
-- Name: param_packs uq_param_pack_child_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.param_packs
    ADD CONSTRAINT uq_param_pack_child_version UNIQUE (child_id, version);


--
-- Name: push_tokens uq_push_token; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT uq_push_token UNIQUE (user_id, platform, token);


--
-- Name: secondary_access uq_secondary_access; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secondary_access
    ADD CONSTRAINT uq_secondary_access UNIQUE (child_id, user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_access_audit_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_access_audit_child ON public.access_audit USING btree (child_id, ts DESC);


--
-- Name: idx_alerts_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_child ON public.alerts USING btree (child_id, created_at DESC);


--
-- Name: idx_alerts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_status ON public.alerts USING btree (status) WHERE (status = 'active'::public.alert_status);


--
-- Name: idx_audio_activations_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audio_activations_child ON public.audio_activations USING btree (child_id, started_at DESC);


--
-- Name: idx_children_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_children_parent ON public.children USING btree (parent_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_community_reports_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_reports_geom ON public.community_reports USING gist (geom);


--
-- Name: idx_community_reports_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_reports_ts ON public.community_reports USING btree (ts DESC);


--
-- Name: idx_device_events_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_events_device ON public.device_events USING btree (device_id, ts DESC);


--
-- Name: idx_devices_online; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_online ON public.devices USING btree (online) WHERE (online = true);


--
-- Name: idx_emergency_contacts_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emergency_contacts_child ON public.emergency_contacts USING btree (child_id);


--
-- Name: idx_familiar_cells_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_familiar_cells_child ON public.familiar_cells USING btree (child_id);


--
-- Name: idx_geofence_schedules_fence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_geofence_schedules_fence ON public.geofence_schedules USING btree (geofence_id);


--
-- Name: idx_geofences_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_geofences_child ON public.geofences USING btree (child_id);


--
-- Name: idx_geofences_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_geofences_geom ON public.geofences USING gist (geom);


--
-- Name: idx_hourly_profiles_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hourly_profiles_child ON public.hourly_profiles USING btree (child_id);


--
-- Name: idx_otp_challenges_user_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_challenges_user_purpose ON public.otp_challenges USING btree (user_id, purpose, created_at DESC);


--
-- Name: idx_param_packs_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_param_packs_child ON public.param_packs USING btree (child_id, version DESC);


--
-- Name: idx_place_schedules_place; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_place_schedules_place ON public.place_schedules USING btree (place_id);


--
-- Name: idx_places_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_child ON public.places USING btree (child_id);


--
-- Name: idx_places_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_places_geom ON public.places USING gist (geom);


--
-- Name: idx_positions_child_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_positions_child_ts ON ONLY public.positions USING btree (child_id, ts DESC);


--
-- Name: idx_positions_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_positions_geom ON ONLY public.positions USING gist (geom);


--
-- Name: idx_push_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_tokens_user ON public.push_tokens USING btree (user_id);


--
-- Name: idx_refresh_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_hash ON public.refresh_tokens USING btree (token_hash);


--
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_risk_scores_child_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_risk_scores_child_ts ON public.risk_scores USING btree (child_id, ts DESC);


--
-- Name: idx_secondary_access_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secondary_access_child ON public.secondary_access USING btree (child_id);


--
-- Name: idx_secondary_access_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secondary_access_user ON public.secondary_access USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email) WHERE (deleted_at IS NULL);


--
-- Name: positions_2026_06_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_06_child_id_ts_idx ON public.positions_2026_06 USING btree (child_id, ts DESC);


--
-- Name: positions_2026_06_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_06_geom_idx ON public.positions_2026_06 USING gist (geom);


--
-- Name: positions_2026_07_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_07_child_id_ts_idx ON public.positions_2026_07 USING btree (child_id, ts DESC);


--
-- Name: positions_2026_07_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_07_geom_idx ON public.positions_2026_07 USING gist (geom);


--
-- Name: positions_2026_08_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_08_child_id_ts_idx ON public.positions_2026_08 USING btree (child_id, ts DESC);


--
-- Name: positions_2026_08_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_08_geom_idx ON public.positions_2026_08 USING gist (geom);


--
-- Name: positions_2026_09_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_09_child_id_ts_idx ON public.positions_2026_09 USING btree (child_id, ts DESC);


--
-- Name: positions_2026_09_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_09_geom_idx ON public.positions_2026_09 USING gist (geom);


--
-- Name: positions_2026_10_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_10_child_id_ts_idx ON public.positions_2026_10 USING btree (child_id, ts DESC);


--
-- Name: positions_2026_10_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_10_geom_idx ON public.positions_2026_10 USING gist (geom);


--
-- Name: positions_2026_11_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_11_child_id_ts_idx ON public.positions_2026_11 USING btree (child_id, ts DESC);


--
-- Name: positions_2026_11_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_11_geom_idx ON public.positions_2026_11 USING gist (geom);


--
-- Name: positions_2026_12_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_12_child_id_ts_idx ON public.positions_2026_12 USING btree (child_id, ts DESC);


--
-- Name: positions_2026_12_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2026_12_geom_idx ON public.positions_2026_12 USING gist (geom);


--
-- Name: positions_2027_01_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_01_child_id_ts_idx ON public.positions_2027_01 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_01_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_01_geom_idx ON public.positions_2027_01 USING gist (geom);


--
-- Name: positions_2027_02_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_02_child_id_ts_idx ON public.positions_2027_02 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_02_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_02_geom_idx ON public.positions_2027_02 USING gist (geom);


--
-- Name: positions_2027_03_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_03_child_id_ts_idx ON public.positions_2027_03 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_03_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_03_geom_idx ON public.positions_2027_03 USING gist (geom);


--
-- Name: positions_2027_04_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_04_child_id_ts_idx ON public.positions_2027_04 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_04_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_04_geom_idx ON public.positions_2027_04 USING gist (geom);


--
-- Name: positions_2027_05_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_05_child_id_ts_idx ON public.positions_2027_05 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_05_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_05_geom_idx ON public.positions_2027_05 USING gist (geom);


--
-- Name: positions_2027_06_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_06_child_id_ts_idx ON public.positions_2027_06 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_06_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_06_geom_idx ON public.positions_2027_06 USING gist (geom);


--
-- Name: positions_2027_07_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_07_child_id_ts_idx ON public.positions_2027_07 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_07_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_07_geom_idx ON public.positions_2027_07 USING gist (geom);


--
-- Name: positions_2027_08_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_08_child_id_ts_idx ON public.positions_2027_08 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_08_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_08_geom_idx ON public.positions_2027_08 USING gist (geom);


--
-- Name: positions_2027_09_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_09_child_id_ts_idx ON public.positions_2027_09 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_09_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_09_geom_idx ON public.positions_2027_09 USING gist (geom);


--
-- Name: positions_2027_10_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_10_child_id_ts_idx ON public.positions_2027_10 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_10_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_10_geom_idx ON public.positions_2027_10 USING gist (geom);


--
-- Name: positions_2027_11_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_11_child_id_ts_idx ON public.positions_2027_11 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_11_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_11_geom_idx ON public.positions_2027_11 USING gist (geom);


--
-- Name: positions_2027_12_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_12_child_id_ts_idx ON public.positions_2027_12 USING btree (child_id, ts DESC);


--
-- Name: positions_2027_12_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_2027_12_geom_idx ON public.positions_2027_12 USING gist (geom);


--
-- Name: positions_default_child_id_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_default_child_id_ts_idx ON public.positions_default USING btree (child_id, ts DESC);


--
-- Name: positions_default_geom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX positions_default_geom_idx ON public.positions_default USING gist (geom);


--
-- Name: uq_children_device; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_children_device ON public.children USING btree (device_id) WHERE (device_id IS NOT NULL);


--
-- Name: positions_2026_06_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2026_06_child_id_ts_idx;


--
-- Name: positions_2026_06_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2026_06_geom_idx;


--
-- Name: positions_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2026_06_pkey;


--
-- Name: positions_2026_07_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2026_07_child_id_ts_idx;


--
-- Name: positions_2026_07_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2026_07_geom_idx;


--
-- Name: positions_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2026_07_pkey;


--
-- Name: positions_2026_08_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2026_08_child_id_ts_idx;


--
-- Name: positions_2026_08_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2026_08_geom_idx;


--
-- Name: positions_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2026_08_pkey;


--
-- Name: positions_2026_09_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2026_09_child_id_ts_idx;


--
-- Name: positions_2026_09_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2026_09_geom_idx;


--
-- Name: positions_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2026_09_pkey;


--
-- Name: positions_2026_10_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2026_10_child_id_ts_idx;


--
-- Name: positions_2026_10_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2026_10_geom_idx;


--
-- Name: positions_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2026_10_pkey;


--
-- Name: positions_2026_11_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2026_11_child_id_ts_idx;


--
-- Name: positions_2026_11_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2026_11_geom_idx;


--
-- Name: positions_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2026_11_pkey;


--
-- Name: positions_2026_12_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2026_12_child_id_ts_idx;


--
-- Name: positions_2026_12_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2026_12_geom_idx;


--
-- Name: positions_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2026_12_pkey;


--
-- Name: positions_2027_01_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_01_child_id_ts_idx;


--
-- Name: positions_2027_01_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_01_geom_idx;


--
-- Name: positions_2027_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_01_pkey;


--
-- Name: positions_2027_02_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_02_child_id_ts_idx;


--
-- Name: positions_2027_02_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_02_geom_idx;


--
-- Name: positions_2027_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_02_pkey;


--
-- Name: positions_2027_03_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_03_child_id_ts_idx;


--
-- Name: positions_2027_03_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_03_geom_idx;


--
-- Name: positions_2027_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_03_pkey;


--
-- Name: positions_2027_04_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_04_child_id_ts_idx;


--
-- Name: positions_2027_04_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_04_geom_idx;


--
-- Name: positions_2027_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_04_pkey;


--
-- Name: positions_2027_05_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_05_child_id_ts_idx;


--
-- Name: positions_2027_05_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_05_geom_idx;


--
-- Name: positions_2027_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_05_pkey;


--
-- Name: positions_2027_06_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_06_child_id_ts_idx;


--
-- Name: positions_2027_06_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_06_geom_idx;


--
-- Name: positions_2027_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_06_pkey;


--
-- Name: positions_2027_07_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_07_child_id_ts_idx;


--
-- Name: positions_2027_07_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_07_geom_idx;


--
-- Name: positions_2027_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_07_pkey;


--
-- Name: positions_2027_08_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_08_child_id_ts_idx;


--
-- Name: positions_2027_08_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_08_geom_idx;


--
-- Name: positions_2027_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_08_pkey;


--
-- Name: positions_2027_09_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_09_child_id_ts_idx;


--
-- Name: positions_2027_09_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_09_geom_idx;


--
-- Name: positions_2027_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_09_pkey;


--
-- Name: positions_2027_10_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_10_child_id_ts_idx;


--
-- Name: positions_2027_10_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_10_geom_idx;


--
-- Name: positions_2027_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_10_pkey;


--
-- Name: positions_2027_11_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_11_child_id_ts_idx;


--
-- Name: positions_2027_11_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_11_geom_idx;


--
-- Name: positions_2027_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_11_pkey;


--
-- Name: positions_2027_12_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_2027_12_child_id_ts_idx;


--
-- Name: positions_2027_12_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_2027_12_geom_idx;


--
-- Name: positions_2027_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_2027_12_pkey;


--
-- Name: positions_default_child_id_ts_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_child_ts ATTACH PARTITION public.positions_default_child_id_ts_idx;


--
-- Name: positions_default_geom_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_positions_geom ATTACH PARTITION public.positions_default_geom_idx;


--
-- Name: positions_default_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.positions_pkey ATTACH PARTITION public.positions_default_pkey;


--
-- Name: audio_activations trg_audio_activations_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audio_activations_audit AFTER INSERT ON public.audio_activations FOR EACH ROW EXECUTE FUNCTION public.log_sensitive_access();


--
-- Name: children trg_children_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_children_updated_at BEFORE UPDATE ON public.children FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: geofences trg_geofences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_geofences_updated_at BEFORE UPDATE ON public.geofences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: places trg_places_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_places_updated_at BEFORE UPDATE ON public.places FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: positions trg_positions_device_heartbeat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_positions_device_heartbeat AFTER INSERT ON public.positions FOR EACH ROW EXECUTE FUNCTION public.update_device_heartbeat();


--
-- Name: secondary_access trg_secondary_access_rules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_secondary_access_rules BEFORE INSERT OR UPDATE OF status, child_id, user_id ON public.secondary_access FOR EACH ROW EXECUTE FUNCTION public.enforce_secondary_access_rules();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: access_audit access_audit_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_audit
    ADD CONSTRAINT access_audit_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: access_audit access_audit_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_audit
    ADD CONSTRAINT access_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: audio_activations audio_activations_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_activations
    ADD CONSTRAINT audio_activations_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: audio_activations audio_activations_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_activations
    ADD CONSTRAINT audio_activations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: children children_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.children
    ADD CONSTRAINT children_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE SET NULL;


--
-- Name: children children_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.children
    ADD CONSTRAINT children_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: community_reports community_reports_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_reports
    ADD CONSTRAINT community_reports_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: device_events device_events_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_events
    ADD CONSTRAINT device_events_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;


--
-- Name: emergency_contacts emergency_contacts_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_contacts
    ADD CONSTRAINT emergency_contacts_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: familiar_cells familiar_cells_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.familiar_cells
    ADD CONSTRAINT familiar_cells_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: geofence_schedules geofence_schedules_geofence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofence_schedules
    ADD CONSTRAINT geofence_schedules_geofence_id_fkey FOREIGN KEY (geofence_id) REFERENCES public.geofences(id) ON DELETE CASCADE;


--
-- Name: geofences geofences_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geofences
    ADD CONSTRAINT geofences_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: hourly_profiles hourly_profiles_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hourly_profiles
    ADD CONSTRAINT hourly_profiles_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: hourly_profiles hourly_profiles_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hourly_profiles
    ADD CONSTRAINT hourly_profiles_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: markov_models markov_models_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markov_models
    ADD CONSTRAINT markov_models_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: otp_challenges otp_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_challenges
    ADD CONSTRAINT otp_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: param_packs param_packs_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.param_packs
    ADD CONSTRAINT param_packs_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: place_schedules place_schedules_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_schedules
    ADD CONSTRAINT place_schedules_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: places places_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT places_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: positions positions_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.positions
    ADD CONSTRAINT positions_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: push_tokens push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: risk_scores risk_scores_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_scores
    ADD CONSTRAINT risk_scores_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: secondary_access secondary_access_child_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secondary_access
    ADD CONSTRAINT secondary_access_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE;


--
-- Name: secondary_access secondary_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secondary_access
    ADD CONSTRAINT secondary_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: access_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: audio_activations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audio_activations ENABLE ROW LEVEL SECURITY;

--
-- Name: children; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

--
-- Name: community_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: device_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_events ENABLE ROW LEVEL SECURITY;

--
-- Name: devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

--
-- Name: emergency_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: familiar_cells; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.familiar_cells ENABLE ROW LEVEL SECURITY;

--
-- Name: geofence_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geofence_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: geofences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

--
-- Name: hourly_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hourly_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: markov_models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.markov_models ENABLE ROW LEVEL SECURITY;

--
-- Name: otp_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otp_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: param_packs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.param_packs ENABLE ROW LEVEL SECURITY;

--
-- Name: place_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.place_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: places; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

--
-- Name: positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2026_06; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2026_06 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2026_07; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2026_07 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2026_08; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2026_08 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2026_09; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2026_09 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2026_10; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2026_10 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2026_11; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2026_11 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2026_12; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2026_12 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_01; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_01 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_02; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_02 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_03; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_03 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_04; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_04 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_05; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_05 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_06; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_06 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_07; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_07 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_08; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_08 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_09; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_09 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_10; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_10 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_11; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_11 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_2027_12; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_2027_12 ENABLE ROW LEVEL SECURITY;

--
-- Name: positions_default; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions_default ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: risk_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.risk_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: secondary_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.secondary_access ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


-- Migrations déjà intégrées à ce schéma (server/migrations/apply.py ne les rejouera pas).
SET search_path = public, extensions;
INSERT INTO public.schema_migrations (version, checksum, applied_at) VALUES ('001', '870aa51646abe1f9600942f6f42936cbf56d3b9d9aa554b448ff09eebaabf426', now()) ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, checksum, applied_at) VALUES ('002', '9ff862861b4cf81a559cf19fca4c1ba6920138328cb0b4670fc26ae9196a3414', now()) ON CONFLICT DO NOTHING;
INSERT INTO public.schema_migrations (version, checksum, applied_at) VALUES ('003', '7316be443dde536d292ed5d89d3e332b30f560b1c67767a767dd4b92f7ca6ae7', now()) ON CONFLICT DO NOTHING;
