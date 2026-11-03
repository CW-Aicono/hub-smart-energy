import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const db = new PGlite();
const read = (file: string) => readFileSync(file, "utf8");
const originalTenant = "10000000-0000-4000-8000-000000000001";
const setupTenant = "10000000-0000-4000-8000-000000000002";
const admin = "20000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,last_sign_in_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.tenants(id uuid PRIMARY KEY);
    CREATE TABLE public.support_sessions(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,ended_at timestamptz);
    CREATE TABLE public.audit_logs(actor_user_id uuid,tenant_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);
    CREATE TABLE public.profiles(user_id uuid,tenant_id uuid);
    CREATE TABLE public.user_roles(user_id uuid,role text);
    CREATE TABLE public.tenant_support_users(auth_user_id uuid);
    CREATE FUNCTION public.has_role(u uuid,r text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r) $$;
    CREATE FUNCTION public.is_partner_admin(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.partner_has_tenant_access(u uuid,t uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    INSERT INTO tenants VALUES('${originalTenant}');
    -- Same incomplete server repair as in the incident: columns only, active default.
    ALTER TABLE tenants ADD COLUMN setup_status text NOT NULL DEFAULT 'active';
    ALTER TABLE tenants ADD COLUMN setup_completed_at timestamptz;
    ALTER TABLE tenants ADD COLUMN setup_completed_by uuid;`);
}, 30000);
afterAll(async () => { await db.close(); });
describe("live setup migration repairs", () => {
  it("detects that merely adding columns does not install the setup workflow", async () => {
    expect((await db.query<{tenant_setup_ready: boolean}>(read("supabase/deploy/tenant-setup-ready.sql"))).rows[0].tenant_setup_ready).toBe(false);
  });
  it("repairs the partial installation, keeps old tenants active and starts new ones in setup", async () => {
    await db.exec(read("drizzle/migrations/0070_tenant_setup_phase.sql"));
    await db.exec(read("drizzle/migrations/0071_tenant_setup_phase_audit_fix.sql"));
    await db.exec(`INSERT INTO tenants(id) VALUES('${setupTenant}')`);
    expect((await db.query("SELECT id,setup_status FROM tenants ORDER BY id")).rows).toEqual([
      {id: originalTenant,setup_status: "active"}, {id: setupTenant,setup_status: "setup"},
    ]);
    expect((await db.query<{tenant_setup_ready: boolean}>(read("supabase/deploy/tenant-setup-ready.sql"))).rows[0].tenant_setup_ready).toBe(true);
  });
  it("allows repeated application without changing existing tenant states", async () => {
    await db.exec(read("drizzle/migrations/0070_tenant_setup_phase.sql"));
    await db.exec(read("drizzle/migrations/0071_tenant_setup_phase_audit_fix.sql"));
    expect((await db.query("SELECT setup_status FROM tenants ORDER BY id")).rows).toEqual([{setup_status:"active"},{setup_status:"setup"}]);
  });
  it("hands over at the first tenant-admin login, closes setup sessions and writes the audit record", async () => {
    await db.exec(`INSERT INTO auth.users(id) VALUES('${admin}');
      INSERT INTO profiles VALUES('${admin}','${setupTenant}');
      INSERT INTO user_roles VALUES('${admin}','admin');
      INSERT INTO support_sessions(tenant_id,session_kind) VALUES('${setupTenant}','setup');
      UPDATE auth.users SET last_sign_in_at=now() WHERE id='${admin}';`);
    expect((await db.query("SELECT setup_status FROM tenants WHERE id=$1", [setupTenant])).rows).toEqual([{setup_status:"active"}]);
    expect((await db.query("SELECT count(*)::int AS open FROM support_sessions WHERE session_kind='setup' AND ended_at IS NULL")).rows).toEqual([{open:0}]);
    expect((await db.query("SELECT action,metadata->>'reason' AS reason FROM audit_logs")).rows).toEqual([{action:"tenant_setup_completed",reason:"tenant_admin_first_login"}]);
  });
  it("never allows a handed-over tenant to return to setup", async () => {
    await expect(db.query("UPDATE tenants SET setup_status='setup' WHERE id=$1", [setupTenant])).rejects.toThrow("Ein übergebener Tenant");
  });
  it("denies manual handover without an authorized role", async () => {
    await db.exec(`SET test.uid='30000000-0000-4000-8000-000000000001'`);
    await expect(db.query("SELECT complete_tenant_setup($1)", [originalTenant])).rejects.toThrow("Keine Berechtigung");
  });
});