-- Läuft VOR den Image-eigenen init-scripts/ (00 < i alphabetisch).
-- Schemas mit IF NOT EXISTS anlegen (idempotent, kein Konflikt mit Image-Scripts).
-- Nötig weil 04-webhooks.sql etc. diese Schemas vor init-scripts/ benötigen.
\set pgpass `echo "$POSTGRES_PASSWORD"`

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

-- Hier NUR supabase_admin anlegen – alle anderen Rollen werden vom Image selbst erstellt:
-- anon, authenticated, service_role, authenticator → initial-schema.sql
-- supabase_auth_admin → auth-schema.sql
-- supabase_storage_admin → storage-schema.sql
-- supabase_functions_admin → post-setup.sql
-- pgbouncer → 00-schema.sql
DO $$
BEGIN
  CREATE ROLE supabase_admin WITH SUPERUSER LOGIN;
EXCEPTION WHEN DUPLICATE_OBJECT THEN
  NULL;
END $$;

-- Passwort JETZT setzen, damit migrate.sh (läuft direkt danach) sich anmelden kann.
-- Alle anderen Passwörter werden in zz-custom.sql gesetzt.
ALTER USER supabase_admin WITH PASSWORD :'pgpass';
