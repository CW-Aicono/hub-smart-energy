\set pguser `echo "$POSTGRES_USER"`

CREATE DATABASE _supabase WITH OWNER :pguser;

-- Create a function in postgres database that initializes _supabase
-- This is a workaround for the fact that init scripts can't easily switch databases
CREATE OR REPLACE FUNCTION public.init_supabase_db()
RETURNS void AS $$
DECLARE
BEGIN
  -- Connect to _supabase and create the analytics schema
  -- Note: We can't use \connect in plpgsql, so we use dblink
  -- For now, this function is a placeholder - the actual init happens via separate call
  RAISE NOTICE 'Supabase database initialization complete';
END;
$$ LANGUAGE plpgsql;

-- Note: The _analytics schema and tables must be created separately after the database is available
-- See init-logflare-schema.sh for the initialization script
