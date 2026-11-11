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
  drizzle/migrations/0074_package_sale_corrections_yearly.sql \
  drizzle/migrations/0075_package_effective_entitlements.sql \
  drizzle/migrations/0076_package_correction_security_guard.sql \
  drizzle/migrations/0077_package_correction_collective_invoice_guard.sql \
  drizzle/migrations/0078_package_correction_fail_closed_auth.sql \
  drizzle/migrations/0079_tenant_setup_deploy_contract.sql \
  drizzle/migrations/0083_effective_modules_auth_fix.sql \
  drizzle/migrations/0088_manual_invoice_booking_options.sql \
  drizzle/migrations/0089_deploy_audit_billing_security.sql \
  supabase/deploy/deploy-audit-ready.sql \
  supabase/deploy/manual-invoice-ready.sql \
  supabase/deploy/package-entitlements-ready.sql \
  supabase/deploy/package-corrections-ready.sql \
  supabase/functions/_shared/supportSessionKind.ts; do
  if [ ! -s "$REPO_ROOT/$file" ]; then
    printf 'FEHLER: Release-Datei fehlt: %s\n' "$file" >&2
    exit 1
  fi
done

grep -q 'resolveSessionKind' "$REPO_ROOT/supabase/functions/support-session-impersonate/index.ts"
grep -q 'session_kind' "$REPO_ROOT/supabase/functions/generate-monthly-invoices/index.ts"
grep -q 'supports_connector_lock' "$REPO_ROOT/supabase/functions/ocpp-central/index.ts"
grep -q 'setup_status: "setup"' "$REPO_ROOT/supabase/functions/partner-create-tenant/index.ts"
grep -q 'sessionSchemaError' "$REPO_ROOT/supabase/functions/support-session-impersonate/index.ts"
grep -q 'finalize_license_sale_options' "$REPO_ROOT/supabase/functions/license-sale/index.ts"
grep -q 'effective_tenant_modules' "$REPO_ROOT/supabase/functions/automation-scheduler/index.ts"
grep -q 'entitlement_enabled' "$REPO_ROOT/supabase/functions/gateway-ingest/index.ts"

ready="$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -At < "$REPO_ROOT/supabase/deploy/tenant-setup-ready.sql")"
if [ "$ready" != 't' ]; then
  printf 'FEHLER: Einrichtungsphase nicht vollstaendig installiert.\n' >&2
  exit 1
fi
pkg="$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -At < "$REPO_ROOT/supabase/deploy/package-entitlements-ready.sql")"
if [ "$pkg" != 't' ]; then
  printf 'FEHLER: Pakete/Modulrechte unvollstaendig (Tabellen, Funktionen oder effective_tenant_modules-Fix 0083 fehlen).\n' >&2
  exit 1
fi
invoice_ready="$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -At < "$REPO_ROOT/supabase/deploy/manual-invoice-ready.sql")"
if [ "$invoice_ready" != 't' ]; then
  printf 'FEHLER: Neue Rechnung mit Buchungsoptionen nicht installiert.\n' >&2
  exit 1
fi
audit_ready="$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -At < "$REPO_ROOT/supabase/deploy/deploy-audit-ready.sql")"
if [ "$audit_ready" != 't' ]; then
  printf 'FEHLER: Abrechnungs-/Sicherheitskorrekturen fehlen.\n' >&2
  exit 1
fi
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$REPO_ROOT/supabase/deploy/live-release-check.sql"
printf 'Live-Release: Einrichtung, Vorlagen und Funktionsdateien vollstaendig.\n'