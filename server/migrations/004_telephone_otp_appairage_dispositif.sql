-- =============================================================================
-- Migration 004 — 2026-10-20 — Téléphone obligatoire, OTP multi-canal,
-- appairage par numéro de série + PIN, commandes et relais du dispositif.
-- Pré-requis : 001 → 003. Uniquement additive (aucune donnée supprimée).
--
--  1. users : e-mail FACULTATIF (DROP NOT NULL) ; téléphone obligatoire pour
--     toute NOUVELLE ligne (trigger à l'insertion — les comptes existants sans
--     téléphone ne sont pas bloqués : ils complètent leur numéro à la connexion,
--     voir docs/DECISIONS_TECHNIQUES.md D-04) ; téléphone vérifié ; unicité du
--     téléphone parmi les comptes actifs.
--  2. otp_challenges : canal (sms | whatsapp | email), empreintes de destination
--     et d'IP (jamais en clair), valeur en attente (nouveau numéro), nouveaux
--     usages (phone_verify, phone_change).
--  3. rate_limit_events : compteur générique (connexion, envoi OTP, appairage).
--  4. devices : PIN d'activation (haché), format du numéro de série
--     SIREN-XXXXX-XXXXX sensible à la casse (contrôlé pour les nouvelles lignes).
--  5. device_commands : commandes descendantes (LOCALISER…) et leur statut.
--  6. device_relay_events : idempotence des trames relayées par un téléphone.
--  7. create_positions_partition : SECURITY DEFINER (appelable par un rôle
--     applicatif sans privilège de création, cf. DEPLOIEMENT_CONTABO.md).
-- Rollback en fin de fichier.
-- =============================================================================

BEGIN;

-- 1. Comptes ------------------------------------------------------------------
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS telephone_verified_at TIMESTAMPTZ;

-- Format international E.164 (normalisé par le serveur avant écriture).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ck_users_telephone_e164;
ALTER TABLE public.users ADD CONSTRAINT ck_users_telephone_e164
    CHECK (telephone IS NULL OR telephone ~ '^\+[1-9][0-9]{6,14}$') NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_telephone_active
    ON public.users (telephone) WHERE telephone IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.require_user_telephone() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.telephone IS NULL OR btrim(NEW.telephone) = '' THEN
        RAISE EXCEPTION 'telephone_required: un numéro de téléphone est obligatoire'
            USING ERRCODE = 'not_null_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_require_telephone ON public.users;
CREATE TRIGGER trg_users_require_telephone
    BEFORE INSERT ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.require_user_telephone();

-- 2. Codes à usage unique -------------------------------------------------------
ALTER TABLE public.otp_challenges ADD COLUMN IF NOT EXISTS channel VARCHAR(10);
ALTER TABLE public.otp_challenges ADD COLUMN IF NOT EXISTS destination_hash CHAR(64);
ALTER TABLE public.otp_challenges ADD COLUMN IF NOT EXISTS ip_hash CHAR(64);
ALTER TABLE public.otp_challenges ADD COLUMN IF NOT EXISTS pending_value VARCHAR(32);

ALTER TABLE public.otp_challenges DROP CONSTRAINT IF EXISTS otp_challenges_purpose_check;
ALTER TABLE public.otp_challenges ADD CONSTRAINT otp_challenges_purpose_check
    CHECK (purpose IN ('signup_verify', 'phone_verify', 'login_2fa', 'password_reset', 'phone_change'));
ALTER TABLE public.otp_challenges DROP CONSTRAINT IF EXISTS ck_otp_channel;
ALTER TABLE public.otp_challenges ADD CONSTRAINT ck_otp_channel
    CHECK (channel IS NULL OR channel IN ('sms', 'whatsapp', 'email'));

CREATE INDEX IF NOT EXISTS idx_otp_challenges_destination
    ON public.otp_challenges (destination_hash, created_at DESC) WHERE destination_hash IS NOT NULL;

-- 3. Limitation de débit -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
    id          BIGSERIAL PRIMARY KEY,
    scope       VARCHAR(30) NOT NULL,
    key_hash    CHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_lookup
    ON public.rate_limit_events (scope, key_hash, created_at DESC);
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- 4. Dispositifs : PIN d'activation et format du numéro de série -------------------
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS activation_pin_hash VARCHAR(255);
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS ck_devices_serial_format;
ALTER TABLE public.devices ADD CONSTRAINT ck_devices_serial_format
    CHECK (device_id ~ '^SIREN-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$') NOT VALID;

-- 5. Commandes descendantes ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_commands (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id     VARCHAR(50) NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    child_id      UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    requested_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    code          VARCHAR(20) NOT NULL CHECK (code IN ('LOCALISER', 'MODE', 'REDEMARRER')),
    valeur        VARCHAR(32),
    status        VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT')),
    detail        VARCHAR(200),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_device_commands_child ON public.device_commands (child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_pending ON public.device_commands (created_at) WHERE status = 'PENDING';
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;

-- 6. Trames relayées par un téléphone (idempotence) ------------------------------
CREATE TABLE IF NOT EXISTS public.device_relay_events (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id     VARCHAR(50) NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    event_id      VARCHAR(64) NOT NULL,
    relayed_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_device_relay_event UNIQUE (device_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_device_relay_events_received ON public.device_relay_events (received_at);
ALTER TABLE public.device_relay_events ENABLE ROW LEVEL SECURITY;

-- 7. Partitions créables par le rôle applicatif ------------------------------------
ALTER FUNCTION public.create_positions_partition(date) SECURITY DEFINER;
ALTER FUNCTION public.create_positions_partition(date) SET search_path = public, extensions;
ALTER FUNCTION public.ensure_positions_partitions(integer) SET search_path = public, extensions;

COMMIT;

-- ----------------------------------------------------------------------------
-- ROLLBACK (manuel) — attention : rendre l'e-mail de nouveau obligatoire échoue
-- si des comptes sans e-mail existent (c'est voulu : ne jamais inventer d'e-mail).
-- BEGIN;
-- DROP TABLE IF EXISTS public.device_relay_events;
-- DROP TABLE IF EXISTS public.device_commands;
-- ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS ck_devices_serial_format;
-- ALTER TABLE public.devices DROP COLUMN IF EXISTS activation_pin_hash;
-- DROP TABLE IF EXISTS public.rate_limit_events;
-- ALTER TABLE public.otp_challenges DROP CONSTRAINT IF EXISTS ck_otp_channel;
-- ALTER TABLE public.otp_challenges DROP COLUMN IF EXISTS pending_value, DROP COLUMN IF EXISTS ip_hash,
--   DROP COLUMN IF EXISTS destination_hash, DROP COLUMN IF EXISTS channel;
-- DROP TRIGGER IF EXISTS trg_users_require_telephone ON public.users;
-- DROP FUNCTION IF EXISTS public.require_user_telephone();
-- DROP INDEX IF EXISTS public.uq_users_telephone_active;
-- ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ck_users_telephone_e164;
-- ALTER TABLE public.users DROP COLUMN IF EXISTS telephone_verified_at;
-- ALTER FUNCTION public.create_positions_partition(date) SECURITY INVOKER;
-- COMMIT;
