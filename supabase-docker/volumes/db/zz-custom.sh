#!/bin/sh
# Läuft NACH migrate.sh (z > m alphabetisch).
# Setzt Passwörter als supabase_admin (Superuser), weil postgres nach
# der Demote-Migration kein Superuser mehr ist und "authenticator"
# ein reservierter Rollenname ist.
set -eu

echo "zz-custom.sh: setting service role passwords..."

psql \
  -v ON_ERROR_STOP=1 \
  --no-password \
  --no-psqlrc \
  -U supabase_admin \
  -d postgres \
  <<EOSQL
\getenv pgpass POSTGRES_PASSWORD

ALTER USER authenticator            WITH LOGIN PASSWORD :'pgpass';
ALTER USER supabase_auth_admin      WITH PASSWORD :'pgpass';
ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin   WITH PASSWORD :'pgpass';

GRANT CONNECT, CREATE ON DATABASE postgres TO supabase_auth_admin;
GRANT CONNECT, CREATE ON DATABASE postgres TO supabase_storage_admin;
GRANT CONNECT, CREATE ON DATABASE postgres TO supabase_functions_admin;

GRANT USAGE, CREATE ON SCHEMA auth    TO supabase_auth_admin;
GRANT USAGE, CREATE ON SCHEMA storage TO supabase_storage_admin;
GRANT USAGE, CREATE ON SCHEMA public  TO supabase_storage_admin;
EOSQL

echo "zz-custom.sh: done."
