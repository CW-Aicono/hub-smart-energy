#!/usr/bin/env bash
# Fail closed before switching the frontend to a release with missing backend files/schema.
set -euo pipefail
REPO_ROOT="${REPO_ROOT:-/opt/hub-smart-energy}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DB_USER="${DB_USER:-supabase_admin}"
DB_NAME="${DB_NAME:-postgres}"

for file in \
  drizzle/migrations/0070_tenant_setup_phase.sql \
  drizzle/migrations/0071_tenant_setup_phase_audit_fix.sql \
  drizzle/migrations/0072_charger_templates_variants.sql \
  drizzle/migrations/0073_vestel_modbus_registers.sql \
  supabase/functions/_shared/supportSessionKind.ts; do
  if [ ! -s "$REPO_ROOT/$file" ]; then
    printf 'FEHLER: Release-Datei fehlt: %s\n' "$file" >&2
    exit 1
  fi
done

grep -q 'resolveSessionKind' "$REPO_ROOT/supabase/functions/support-session-impersonate/index.ts"
grep -q 'session_kind' "$REPO_ROOT/supabase/functions/generate-monthly-invoices/index.ts"
grep -q 'supports_connector_lock' "$REPO_ROOT/supabase/functions/ocpp-central/index.ts"

ready="$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -At < "$REPO_ROOT/supabase/deploy/tenant-setup-ready.sql")"
if [ "$ready" != 't' ]; then
  printf 'FEHLER: Einrichtungsphase nicht vollstaendig installiert.\n' >&2
  exit 1
fi
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$REPO_ROOT/supabase/deploy/live-release-check.sql"
printf 'Live-Release: Einrichtung, Vorlagen und Funktionsdateien vollstaendig.\n'