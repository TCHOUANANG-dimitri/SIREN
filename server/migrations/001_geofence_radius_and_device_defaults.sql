-- =============================================================================
-- Migration 001 — 2026-09-27
--  1. geofences.radius_m : le rayon saisi par le parent n'était pas stocké
--     (le serveur renvoyait toujours 100 m). Les périmètres existants gardent 100 m,
--     valeur qu'ils avaient de fait.
--  2. devices : valeurs par défaut alignées sur le contrat app / CDC
--     (energy_mode ∈ continu|equilibre|economie, sensitivity = entier 0..100 en texte).
--     Les lignes existantes à 'normal' sont converties vers les défauts équivalents.
--  3. refresh_tokens.token_hash : empreinte SHA-256 (voir app/core/security.hash_token).
--     Les anciennes empreintes bcrypt ne peuvent plus être retrouvées : elles sont révoquées
--     (les utilisateurs devront se reconnecter une fois).
-- Non destructive pour les données métier. Rollback en fin de fichier.
-- =============================================================================
BEGIN;

ALTER TABLE geofences ADD COLUMN IF NOT EXISTS radius_m REAL NOT NULL DEFAULT 100;
ALTER TABLE geofences DROP CONSTRAINT IF EXISTS geofences_radius_m_check;
ALTER TABLE geofences ADD CONSTRAINT geofences_radius_m_check CHECK (radius_m >= 10 AND radius_m <= 50000);

ALTER TABLE devices ALTER COLUMN energy_mode SET DEFAULT 'equilibre';
ALTER TABLE devices ALTER COLUMN sensitivity SET DEFAULT '50';
UPDATE devices SET energy_mode = 'equilibre' WHERE energy_mode = 'normal';
UPDATE devices SET sensitivity = '50' WHERE sensitivity = 'normal';

UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash LIKE '$2%';

COMMIT;

-- ----------------------------------------------------------------------------
-- ROLLBACK (à exécuter manuellement si nécessaire) :
-- BEGIN;
-- ALTER TABLE geofences DROP CONSTRAINT IF EXISTS geofences_radius_m_check;
-- ALTER TABLE geofences DROP COLUMN IF EXISTS radius_m;
-- ALTER TABLE devices ALTER COLUMN energy_mode SET DEFAULT 'normal';
-- ALTER TABLE devices ALTER COLUMN sensitivity SET DEFAULT 'normal';
-- COMMIT;
-- ----------------------------------------------------------------------------
