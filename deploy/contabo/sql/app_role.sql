-- Rôle applicatif à moindre privilège (idempotent). Exécuté par deploy.sh en tant
-- que propriétaire du schéma :
--   (variables app_user, app_password, db_name fournies par \set sur l'entrée standard)
--
-- - LOGIN, aucun droit de création (base, rôle, schéma, table) : pas de DDL ;
-- - lecture/écriture des données (SELECT, INSERT, UPDATE, DELETE), séquences, fonctions ;
-- - BYPASSRLS : RLS est activée sur les tables (héritage Supabase) SANS politique ;
--   l'isolation entre familles est appliquée par l'API (app/core/authz.py), testée.
--   Sans cet attribut, un rôle non propriétaire ne verrait aucune ligne.
-- - les partitions mensuelles de positions sont créées par une fonction SECURITY
--   DEFINER (migration 004) : le rôle applicatif n'a pas besoin de droit DDL ;
-- - privilèges par défaut : les tables créées plus tard par les migrations sont accessibles.
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE %I LOGIN', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec

ALTER ROLE :"app_user" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS
    CONNECTION LIMIT 60 PASSWORD :'app_password';

REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db_name" TO :"app_user";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public, extensions TO :"app_user";

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT SELECT ON ALL TABLES IN SCHEMA extensions TO :"app_user";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, extensions TO :"app_user";
-- Le journal des migrations n'est modifiable que par le propriétaire (table absente
-- sur une base ancienne jamais migrée : deploy.sh applique ce fichier APRÈS les migrations).
SELECT format('REVOKE INSERT, UPDATE, DELETE ON public.schema_migrations FROM %I', :'app_user')
WHERE to_regclass('public.schema_migrations') IS NOT NULL \gexec

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO :"app_user";
