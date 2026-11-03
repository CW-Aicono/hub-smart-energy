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
  for (const file of ["scripts/apply-migrations.sh", "supabase/deploy/tenant-setup-ready.sql", "supabase/deploy/live-release-check.sql", "supabase/deploy/verify-live-release.sh", "drizzle/migrations/0070_tenant_setup_phase.sql", "drizzle/migrations/0071_tenant_setup_phase_audit_fix.sql", "drizzle/migrations/0072_charger_templates_variants.sql", "drizzle/migrations/0073_vestel_modbus_registers.sql", "drizzle/migrations/0074_package_sale_corrections_yearly.sql", "drizzle/migrations/0075_package_effective_entitlements.sql", "drizzle/migrations/0076_package_correction_security_guard.sql", "drizzle/migrations/0077_package_correction_collective_invoice_guard.sql", "drizzle/migrations/0078_package_correction_fail_closed_auth.sql", "drizzle/migrations/0079_tenant_setup_deploy_contract.sql", "supabase/functions/_shared/supportSessionKind.ts"]) copyFileSync(file, join(dir,file));
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
if [[ "$input" == *"AS tenant_setup_ready"* ]]; then
  if [ -f "$REPO_ROOT/repaired" ]; then echo t; else echo f; fi
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
  it("repairs a partial setup even if tracking says every migration was already applied", () => {
    const { dir,run } = fixture();
    run();
    expect(existsSync(join(dir,"repaired"))).toBe(true);
    expect(existsSync(join(dir,"notified"))).toBe(true);
    expect(readFileSync(join(dir,"queries.log"),"utf8")).toContain("trg_prevent_tenant_setup_reopen");
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