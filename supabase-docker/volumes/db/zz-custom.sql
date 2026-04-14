-- Läuft NACH den Image-eigenen init-scripts/ (z > i alphabetisch).
-- Setzt Passwörter und Grants, nachdem alle Rollen vom Image angelegt wurden.

ALTER USER authenticator            WITH PASSWORD '2e34aa0615e898ae1a13b07fcb93c298';
ALTER USER supabase_admin           WITH PASSWORD '2e34aa0615e898ae1a13b07fcb93c298';
ALTER USER supabase_auth_admin      WITH PASSWORD '2e34aa0615e898ae1a13b07fcb93c298';
ALTER USER supabase_functions_admin WITH PASSWORD '2e34aa0615e898ae1a13b07fcb93c298';
ALTER USER supabase_storage_admin   WITH PASSWORD '2e34aa0615e898ae1a13b07fcb93c298';

-- DB-Level Grants für Service-Rollen (CONNECT + CREATE)
GRANT CONNECT, CREATE ON DATABASE postgres TO supabase_auth_admin;
GRANT CONNECT, CREATE ON DATABASE postgres TO supabase_storage_admin;
GRANT CONNECT, CREATE ON DATABASE postgres TO supabase_functions_admin;

-- Schema-Level Grants
GRANT USAGE, CREATE ON SCHEMA auth TO supabase_auth_admin;
GRANT USAGE, CREATE ON SCHEMA storage TO supabase_storage_admin;
GRANT USAGE, CREATE ON SCHEMA public TO supabase_storage_admin;

-- auth-Funktionen droppen, die das Image mit falschem Owner erstellt hat,
-- damit GoTrue sie beim Start neu anlegen kann
DROP FUNCTION IF EXISTS auth.uid();
DROP FUNCTION IF EXISTS auth.role();
