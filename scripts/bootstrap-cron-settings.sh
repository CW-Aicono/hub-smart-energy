#!/usr/bin/env bash
# Befuellt private.cron_settings einmalig (bzw. aktualisiert sie idempotent) mit
# SERVICE_ROLE_KEY aus der .env, damit pg_cron-Jobs Edge Functions ansprechen.
# Auf Lovable Cloud wird dieses Skript nicht ausgefuehrt -> Tabelle bleibt leer -> Jobs no-op.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/hub-smart-energy}"
ENV_FILE="${REPO_ROOT}/supabase-docker/.env"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DB_USER="${DB_USER:-supabase_admin}"
DB_NAME="${DB_NAME:-postgres}"

# Interner Docker-Pfad: supabase-db erreicht kong direkt im Compose-Netzwerk,
# ohne TLS, ohne Caddy-Hop, ohne DNS nach aussen.
# Fallback bei internem Problem: https://api-ems.aicono.org
CRON_URL="${CRON_URL:-http://kong:8000}"

log() { printf '[bootstrap-cron %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

if [ ! -f "$ENV_FILE" ]; then
  log "Skip: $ENV_FILE nicht gefunden."
  exit 0
fi

# Nur SERVICE_ROLE_KEY rausziehen, kein source der ganzen Datei (Side-Effects vermeiden).
SERVICE_ROLE_KEY="$(grep -E '^SERVICE_ROLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/')"

if [ -z "$SERVICE_ROLE_KEY" ]; then
  log "Skip: SERVICE_ROLE_KEY in $ENV_FILE leer/nicht gesetzt."
  exit 0
fi

# Tabelle vorhanden? Wenn nicht, ist die Migration noch nicht durch - sauber abbrechen.
exists="$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c \
  "SELECT 1 FROM information_schema.tables WHERE table_schema='private' AND table_name='cron_settings'")"
if [ "$exists" != "1" ]; then
  log "Skip: private.cron_settings existiert noch nicht (Migration noch nicht angewendet?)."
  exit 0
fi

log "Setze cron_settings (url=$CRON_URL, enabled=true)"
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -v "url=$CRON_URL" \
  -v "key=$SERVICE_ROLE_KEY" >/dev/null <<'SQL'
INSERT INTO private.cron_settings (id, supabase_url, service_role_key, enabled)
VALUES (true, :'url', :'key', true)
ON CONFLICT (id) DO UPDATE
  SET supabase_url     = EXCLUDED.supabase_url,
      service_role_key = EXCLUDED.service_role_key,
      enabled          = true,
      updated_at       = now();
SQL

log "Fertig."
