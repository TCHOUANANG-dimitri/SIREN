-- =============================================================================
-- Migration 002 — 2026-09-30
--  1. otp_challenges : codes à usage unique envoyés par email (inscription,
--     vérification en deux étapes, mot de passe oublié). Code et jeton hachés.
--  2. users.email_verified_at : adresse confirmée par code.
--  3. users.terms_version / privacy_version / legal_accepted_at : preuve des
--     versions des documents juridiques acceptées à l'inscription.
-- Uniquement additive (aucune donnée modifiée ni supprimée). Rollback en fin de fichier.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS otp_challenges (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose      VARCHAR(20) NOT NULL CHECK (purpose IN ('signup_verify', 'login_2fa', 'password_reset')),
    token_hash   VARCHAR(64) NOT NULL UNIQUE,
    code_hash    VARCHAR(64) NOT NULL,
    attempts     INTEGER NOT NULL DEFAULT 0,
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_user_purpose ON otp_challenges(user_id, purpose, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMPTZ;

COMMIT;

-- Purge conseillée (tâche planifiée) : les challenges n'ont plus d'utilité après expiration.
--   DELETE FROM otp_challenges WHERE expires_at < NOW() - INTERVAL '1 day';

-- ----------------------------------------------------------------------------
-- ROLLBACK (à exécuter manuellement si nécessaire) :
-- BEGIN;
-- DROP TABLE IF EXISTS otp_challenges;
-- ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS terms_version;
-- ALTER TABLE users DROP COLUMN IF EXISTS privacy_version;
-- ALTER TABLE users DROP COLUMN IF EXISTS legal_accepted_at;
-- COMMIT;
