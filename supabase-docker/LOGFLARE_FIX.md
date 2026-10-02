# Fix for Supabase Analytics/Logflare Initialization Error

## Problem
When running `docker compose up`, the `supabase-analytics` container would fail with the error:
```
dependency failed to start: container supabase-analytics is unhealthy
```

The container logs showed errors related to the `_analytics` schema not existing:
```
ERROR 3F000 (invalid_schema_name) no schema has been selected to create in
ERROR 42P01 (undefined_table) relation "system_metrics" does not exist
```

## Root Cause
The Logflare analytics container tries to run database migrations on startup, but the `_analytics` schema in the `_supabase` database wasn't being initialized during the database setup. The PostgreSQL initialization scripts in `docker-entrypoint-initdb.d/` run on the `postgres` database by default, and using `\connect` to switch databases in batch SQL scripts is unreliable.

## Solution
The solution is two-part:

### 1. Update `docker-compose.yml`
Ensure the database volume mounts reference the correct SQL initialization file:
```yaml
volumes:
  - ./volumes/db/02-_supabase.sql:/docker-entrypoint-initdb.d/02-_supabase.sql:Z
```

### 2. Run the initialization script after database is healthy
Execute the provided `init-logflare-schema.sh` script after the database container is running and healthy:

```bash
./init-logflare-schema.sh
```

This script will:
- Create the `_analytics` schema in the `_supabase` database
- Create required tables: `schema_migrations`, `system_metrics`, `sources`
- Grant appropriate permissions to `supabase_admin` and `postgres` users
- Set the default `search_path` on the `_supabase` database

## Usage

### Automatic (after fresh start)
```bash
# Start the compose
docker compose up -d

# Wait for the database to be healthy (about 30 seconds)
sleep 30

# Initialize the schema
./init-logflare-schema.sh

# Restart the analytics service
docker compose restart supabase-analytics
```

### One-liner
```bash
docker compose up -d && sleep 30 && ./init-logflare-schema.sh && docker compose restart supabase-analytics
```

## Files Modified
- `docker-compose.yml` - Updated database volume mount path
- `./volumes/db/02-_supabase.sql` - Updated with placeholder comment
- `./init-logflare-schema.sh` - Created initialization script

## Notes
- The `init-logflare-schema.sh` script uses `docker exec` to run `psql` inside the database container, making it portable and not requiring psql to be installed on the host
- The script idempotently creates tables using `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times
- Auth and Storage services may still restart due to a separate permissions issue on the public schema, but Analytics will be functional
