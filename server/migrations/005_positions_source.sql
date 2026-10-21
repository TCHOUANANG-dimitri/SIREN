-- =============================================================================
-- Migration 005 — 2026-10-20 — Origine des positions.
-- Pré-requis : 001 → 004. Uniquement additive.
--
-- positions.source : « device » (boîtier, authentifié par sa clé ou le broker),
-- « relay » (trame relayée par le téléphone d'un compte autorisé — la trame du
-- protocole n'étant ni signée ni chiffrée, l'origine est tracée pour l'audit et
-- le scoring, cf. docs/DECISIONS_TECHNIQUES.md D-08), « sms » (secours SMS).
-- La valeur par défaut constante n'entraîne pas de réécriture de la table (PG ≥ 11)
-- et se propage à toutes les partitions.
-- Rollback en fin de fichier.
-- =============================================================================

BEGIN;

ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'device';
ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS ck_positions_source;
ALTER TABLE public.positions ADD CONSTRAINT ck_positions_source CHECK (source IN ('device', 'relay', 'sms'));

COMMIT;

-- ROLLBACK (manuel)
-- BEGIN;
-- ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS ck_positions_source;
-- ALTER TABLE public.positions DROP COLUMN IF EXISTS source;
-- COMMIT;
