-- =============================================================================
-- Migration 003 — 2026-10-15 — Alignement du schéma de production (Supabase,
-- sauvegarde du 25/09/2026 analysée dans data/SCHEMA.md) sur le serveur et le CDC.
-- Pré-requis : migrations 001 et 002 appliquées.
--
--  1. device_event_type : valeurs manquantes pour les événements déjà acceptés
--     par l'API d'ingestion (power_on, power_off, charging, code inconnu).
--  2. places.radius_m : défaut 100 m (règle déclarative DEFAULT_PLACE_RADIUS_M).
--  3. Suppression des triggers trg_risk_scores_auto_alert / auto_resolve :
--     ils créaient une alerte à CHAQUE score ≥ 30 (doublon avec le serveur, qui
--     n'en crée qu'à l'escalade, et contraire à « 2 mesures pour confirmer »).
--     Le second ne se déclenchait jamais (les scores ne sont jamais mis à jour).
--  4. Règles de partage garanties par la base : 3 proches non révoqués maximum
--     par enfant, interdiction de partager avec le parent de l'enfant lui-même.
--  5. Contraintes de valeurs : langue, mode d'énergie, sensibilité, rayons, essais OTP.
--  6. Partitions mensuelles des positions : fonction de création + 15 mois à venir
--     (sans elles, toutes les positions après septembre 2026 tombent dans
--     positions_default).
--  7. RLS activée sur otp_challenges, comme sur toutes les autres tables
--     (aucune politique : l'API Supabase anonyme n'a aucun accès ; le serveur
--     se connecte avec le rôle propriétaire).
-- Aucune donnée n'est supprimée. Rollback en fin de fichier.
-- =============================================================================

-- 1. Valeurs d'énumération (hors transaction : une valeur ajoutée n'est utilisable
--    qu'après validation de la transaction qui l'ajoute).
ALTER TYPE public.device_event_type ADD VALUE IF NOT EXISTS 'allumage';
ALTER TYPE public.device_event_type ADD VALUE IF NOT EXISTS 'extinction';
ALTER TYPE public.device_event_type ADD VALUE IF NOT EXISTS 'en_charge';
ALTER TYPE public.device_event_type ADD VALUE IF NOT EXISTS 'autre';

BEGIN;

-- 2. Rayon par défaut des lieux.
ALTER TABLE public.places ALTER COLUMN radius_m SET DEFAULT 100;

-- 3. Cycle de vie des alertes : géré uniquement par le serveur.
DROP TRIGGER IF EXISTS trg_risk_scores_auto_alert ON public.risk_scores;
DROP TRIGGER IF EXISTS trg_risk_scores_auto_resolve ON public.risk_scores;
DROP FUNCTION IF EXISTS public.auto_escalate_alert();
DROP FUNCTION IF EXISTS public.auto_resolve_alerts();

-- 4. Règles de partage (défense en profondeur ; l'API les vérifie déjà).
CREATE OR REPLACE FUNCTION public.enforce_secondary_access_rules() RETURNS trigger
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

DROP TRIGGER IF EXISTS trg_secondary_access_rules ON public.secondary_access;
CREATE TRIGGER trg_secondary_access_rules
    BEFORE INSERT OR UPDATE OF status, child_id, user_id ON public.secondary_access
    FOR EACH ROW EXECUTE FUNCTION public.enforce_secondary_access_rules();

-- 5. Contraintes de valeurs (les lignes existantes sont validées ; la base de
--    production analysée ne contient aucune ligne).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ck_users_langue;
ALTER TABLE public.users ADD CONSTRAINT ck_users_langue CHECK (langue IN ('fr', 'en'));

ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS ck_devices_energy_mode;
ALTER TABLE public.devices ADD CONSTRAINT ck_devices_energy_mode
    CHECK (energy_mode IN ('continu', 'equilibre', 'economie'));
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS ck_devices_sensitivity;
ALTER TABLE public.devices ADD CONSTRAINT ck_devices_sensitivity
    CHECK (sensitivity ~ '^[0-9]{1,3}$' AND sensitivity::integer BETWEEN 0 AND 100);

ALTER TABLE public.places DROP CONSTRAINT IF EXISTS ck_places_radius_m;
ALTER TABLE public.places ADD CONSTRAINT ck_places_radius_m CHECK (radius_m >= 10 AND radius_m <= 50000);

ALTER TABLE public.otp_challenges DROP CONSTRAINT IF EXISTS ck_otp_attempts;
ALTER TABLE public.otp_challenges ADD CONSTRAINT ck_otp_attempts CHECK (attempts >= 0);

-- 6. Partitions mensuelles des positions.
CREATE OR REPLACE FUNCTION public.create_positions_partition(p_month date) RETURNS text
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

CREATE OR REPLACE FUNCTION public.ensure_positions_partitions(p_months_ahead integer DEFAULT 3) RETURNS integer
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

SELECT public.create_positions_partition((make_date(2026, 10, 1) + make_interval(months => m))::date)
  FROM generate_series(0, 14) AS m;

-- 7. RLS homogène.
ALTER TABLE public.otp_challenges ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ----------------------------------------------------------------------------
-- ROLLBACK (à exécuter manuellement si nécessaire ; les valeurs ajoutées à
-- device_event_type ne peuvent pas être retirées sans recréer le type) :
-- BEGIN;
-- ALTER TABLE public.places ALTER COLUMN radius_m SET DEFAULT 50;
-- DROP TRIGGER IF EXISTS trg_secondary_access_rules ON public.secondary_access;
-- DROP FUNCTION IF EXISTS public.enforce_secondary_access_rules();
-- ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ck_users_langue;
-- ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS ck_devices_energy_mode;
-- ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS ck_devices_sensitivity;
-- ALTER TABLE public.places DROP CONSTRAINT IF EXISTS ck_places_radius_m;
-- ALTER TABLE public.otp_challenges DROP CONSTRAINT IF EXISTS ck_otp_attempts;
-- -- Partitions positions_2026_10 … positions_2027_12 : à conserver (elles contiennent les positions).
-- -- Triggers d'alerte supprimés : recréables depuis data/SCHEMA.md (§ Historique) si nécessaire.
-- COMMIT;
