import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture(failRelease = false) {
  const dir = mkdtempSync(join(tmpdir(), "live-runner-")); dirs.push(dir);
  for (const folder of ["bin", "scripts", "supabase/deploy", "supabase/migrations", "drizzle/migrations", "supabase/functions/_shared", "supabase/functions/support-session-impersonate", "supabase/functions/generate-monthly-invoices", "supabase/functions/ocpp-central", "supabase/functions/partner-create-tenant", "supabase/functions/license-sale", "supabase/functions/automation-scheduler", "supabase/functions/gateway-ingest"]) mkdirSync(join(dir, folder), { recursive: true });
  for (const file of ["drizzle/migrations/0090_package_fixed_terms_total_price.sql", "supabase/deploy/package-fixed-terms-ready.sql","drizzle/migrations/0089_deploy_audit_billing_security.sql", "supabase/deploy/deploy-audit-ready.sql", "drizzle/migrations/0088_manual_invoice_booking_options.sql", "supabase/deploy/manual-invoice-ready.sql", "scripts/apply-migrations.sh", "supabase/deploy/tenant-setup-ready.sql", "supabase/deploy/live-release-check.sql", "supabase/deploy/verify-live-release.sh", "drizzle/migrations/0070_tenant_setup_phase.sql", "drizzle/migrations/0071_tenant_setup_phase_audit_fix.sql", "drizzle/migrations/0072_charger_templates_variants.sql", "drizzle/migrations/0073_vestel_modbus_registers.sql", "drizzle/migrations/0074_package_sale_corrections_yearly.sql", "drizzle/migrations/0075_package_effective_entitlements.sql", "drizzle/migrations/0076_package_correction_security_guard.sql", "drizzle/migrations/0077_package_correction_collective_invoice_guard.sql", "drizzle/migrations/0078_package_correction_fail_closed_auth.sql", "drizzle/migrations/0079_tenant_setup_deploy_contract.sql", "drizzle/migrations/0083_effective_modules_auth_fix.sql", "supabase/deploy/package-entitlements-ready.sql", "supabase/deploy/package-corrections-ready.sql", "supabase/functions/_shared/supportSessionKind.ts"]) copyFileSync(file, join(dir,file));
  writeFileSync(join(dir,"supabase/functions/support-session-impersonate/index.ts"), "resolveSessionKind sessionSchemaError");
  writeFileSync(join(dir,"supabase/functions/partner-create-tenant/index.ts"), 'setup_status: "setup"');
  writeFileSync(join(dir,"supabase/functions/license-sale/index.ts"), 'finalize_license_sale_options');
  writeFileSync(join(dir,"supabase/functions/automation-scheduler/index.ts"), 'effective_tenant_modules');
  writeFileSync(join(dir,"supabase/functions/gateway-ingest/index.ts"), 'entitlement_enabled');
  writeFileSync(join(dir,"supabase/functions/generate-monthly-invoices/index.ts"), "session_kind");
  writeFileSync(join(dir,"supabase/functions/ocpp-central/index.ts"), "supports_connector_lock");
  const docker = join(dir,"bin/docker");
  writeFileSync(docker, `#!/usr/bin/env bash
set -eu
if [[ "$*" == *" -c "* ]]; then
  if [[ "$*" == *"SELECT 1 FROM"* ]]; then echo 1; fi
  if [[ "$*" == *"NOTIFY pgrst"* ]]; then touch "$REPO_ROOT/notified"; fi
  exit 0
fi
input="$(cat)"
printf '%s\\n' "$input" >> "$REPO_ROOT/queries.log"
if [[ "$input" == *"AS package_fixed_terms_ready"* ]]; then
  if [ -f "$REPO_ROOT/fixed_ready" ]; then echo t; else echo f; fi
elif [[ "$input" == *"package_fixed_terms_v1450: active"* ]]; then
  touch "$REPO_ROOT/fixed_ready"
elif [[ "$input" == *"AS deploy_audit_ready"* ]]; then
  if [ -f "$REPO_ROOT/audit_ready" ]; then echo t; else echo f; fi
elif [[ "$input" == *"deploy_audit_v1442: handover"* ]]; then
  touch "$REPO_ROOT/audit_ready"
elif [[ "$input" == *"AS manual_invoice_ready"* ]]; then
  if [ -f "$REPO_ROOT/manual_ready" ]; then echo t; else echo f; fi
elif [[ "$input" == *"CREATE OR REPLACE FUNCTION public.create_quoted_manual_invoice"* ]]; then
  touch "$REPO_ROOT/manual_ready"
elif [[ "$input" == *"AS tenant_setup_ready"* ]]; then
  if [ -f "$REPO_ROOT/repaired" ]; then echo t; else echo f; fi
elif [[ "$input" == *"license_sale_corrections') IS NOT NULL"* ]]; then
  if [ -f "$REPO_ROOT/corrected" ] || [ -f "$REPO_ROOT/corrections_present" ]; then echo t; else echo f; fi
elif [[ "$input" == *"pricing_package_modules') IS NOT NULL"* ]]; then
  echo t
elif [[ "$input" == *"CREATE OR REPLACE FUNCTION public.cancel_mistaken_license_sale"* ]]; then
  touch "$REPO_ROOT/corrected"
elif [[ "$input" == *"CREATE OR REPLACE FUNCTION public._finish_tenant_setup"* && "$input" == *"actor_user_id"* ]]; then
  touch "$REPO_ROOT/repaired"
elif [[ "$input" == *'DO $release_check$'* && "${failRelease ? "1" : "0"}" == 1 ]]; then
  echo 'ERROR: release incomplete' >&2; exit 1
fi
`);
  chmodSync(docker, 0o755);
  return { dir, run: () => execFileSync("bash", [join(dir,"scripts/apply-migrations.sh")], { env: {...process.env, REPO_ROOT: dir, PATH: `${join(dir,"bin")}:${process.env.PATH}`}, encoding: "utf8", stdio: "pipe" }) };
}
describe("live migration runner release gate", () => {
  it("repairs fixed term and negotiated price drift despite tracking", () => {
    const {dir,run} = fixture(); run();
    expect(existsSync(join(dir,"fixed_ready"))).toBe(true);
  });
  it("repairs billing and security drift despite applied tracking", () => {
    const { dir, run } = fixture(); run();
    expect(existsSync(join(dir, "audit_ready"))).toBe(true);
    expect(readFileSync(join(dir, "queries.log"), "utf8")).toContain('REVOKE ALL ON public.meter_daily_totals_mv_repair_backup_20260617');
  });
  it("repairs manual invoice pricing even when migration tracking says applied", () => {
    const { dir, run } = fixture(); run();
    expect(existsSync(join(dir, "manual_ready"))).toBe(true);
    expect(readFileSync(join(dir, "queries.log"), "utf8")).toContain("create_quoted_manual_invoice");
  });
  it("repairs a partial setup even if tracking says every migration was already applied", () => {
    const { dir,run } = fixture();
    run();
    expect(existsSync(join(dir,"repaired"))).toBe(true);
    expect(existsSync(join(dir,"notified"))).toBe(true);
    expect(readFileSync(join(dir,"queries.log"),"utf8")).toContain("trg_prevent_tenant_setup_reopen");
  });
  it("reinstalls the mistaken-booking reversal even if tracking marks 0074-0078 as applied", () => {
    const { dir,run } = fixture();
    run();
    expect(existsSync(join(dir,"corrected"))).toBe(true);
    expect(readFileSync(join(dir,"queries.log"),"utf8")).toContain("cancel_mistaken_license_sale");
  });
  it("does not replay correction migrations when they are already installed", () => {
    const { dir,run } = fixture();
    writeFileSync(join(dir,"corrections_present"),"");
    run();
    expect(existsSync(join(dir,"corrected"))).toBe(false);
  });
  it("fails the existing deploy when the actual release check fails, without reloading the API", () => {
    const { dir,run } = fixture(true);
    expect(run).toThrow();
    expect(existsSync(join(dir,"notified"))).toBe(false);
  });
  it("refuses missing mandatory release files even when all migrations are marked applied", () => {
    const {dir,run} = fixture();
    rmSync(join(dir,"drizzle/migrations/0079_tenant_setup_deploy_contract.sql"));
    expect(run).toThrow();
    expect(existsSync(join(dir,"notified"))).toBe(false);
  });
});