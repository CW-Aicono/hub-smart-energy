#!/bin/bash
# Initialize Logflare's _analytics schema
# This script should be run after the database container is healthy
# Usage: ./init-logflare-schema.sh
# Or with custom settings: POSTGRES_HOST=db POSTGRES_PORT=5432 ./init-logflare-schema.sh

set -e

# Configuration - read from environment or use defaults  
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"

# Try to get password from .env file if not already set
if [ -z "$POSTGRES_PASSWORD" ]; then
    if [ -f ".env" ]; then
        export $(grep POSTGRES_PASSWORD .env | xargs 2>/dev/null || true)
    fi
fi

if [ -z "$POSTGRES_PASSWORD" ]; then
    echo "Error: POSTGRES_PASSWORD not set. Please set it or provide it in .env file"
    exit 1
fi

echo "Initializing Logflare _analytics schema in _supabase database..."
echo "  Host: $POSTGRES_HOST"
echo "  Port: $POSTGRES_PORT"
echo "  User: $POSTGRES_USER"

# Use docker exec to run psql inside the database container
# This is more reliable than trying to connect from the host
docker exec supabase-db bash -c "PGPASSWORD='$POSTGRES_PASSWORD' psql -U $POSTGRES_USER -d _supabase" << 'EOF'
-- Create _analytics schema
CREATE SCHEMA IF NOT EXISTS _analytics;
GRANT ALL ON SCHEMA _analytics TO supabase_admin, postgres;

-- Create schema_migrations table for Ecto migrations
CREATE TABLE IF NOT EXISTS _analytics.schema_migrations (
  version bigint primary key,
  inserted_at timestamp not null default current_timestamp
);

-- Create system_metrics table (required by Logflare startup)
CREATE TABLE IF NOT EXISTS _analytics.system_metrics (
  id bigserial primary key,
  all_logs_logged bigint,
  node text,
  inserted_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

-- Create sources table (required by Logflare)
CREATE TABLE IF NOT EXISTS _analytics.sources (
  id bigserial primary key,
  name text,
  service_name text,
  token text unique,
  public_token text unique,
  favorite boolean default false,
  bigquery_table_ttl integer,
  api_quota integer,
  webhook_notification_url text,
  slack_hook_url text,
  bq_table_partition_type text,
  bq_storage_write_api boolean,
  custom_event_message_keys jsonb,
  log_events_updated_at timestamp,
  notifications_every integer,
  lock_schema boolean,
  validate_schema boolean,
  drop_lql_filters boolean,
  drop_lql_string boolean,
  disable_tailing boolean,
  suggested_keys text[],
  transform_copy_fields boolean,
  bigquery_clustering_fields text[],
  system_source boolean,
  system_source_type text,
  labels jsonb,
  default_ingest_backend_enabled boolean,
  user_id bigint,
  notifications jsonb,
  inserted_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

-- Grant privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA _analytics TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA _analytics TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA _analytics TO supabase_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA _analytics TO supabase_admin;

-- Set default search_path for new connections
ALTER DATABASE _supabase SET search_path = _analytics, public;
EOF

echo "✓ Logflare schema initialized successfully"
echo ""
echo "You can now start/restart the analytics service:"
echo "  docker compose restart supabase-analytics"
