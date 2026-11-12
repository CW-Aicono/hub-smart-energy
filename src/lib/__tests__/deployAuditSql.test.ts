import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
const db = new PGlite();
const tenant = "10000000-0000-4000-8000-000000000001", sale = "30000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    CREATE TABLE access(allowed boolean); INSERT INTO access VALUES(true);
    CREATE FUNCTION can_portal_write(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT allowed FROM access $$;
    CREATE FUNCTION can_manage_partner_billing(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE tenants(id uuid primary key,name text,setup_status text,setup_completed_at timestamptz,setup_completed_by uuid);
    CREATE TABLE support_sessions(tenant_id uuid,session_kind text,ended_at timestamptz);
    CREATE TABLE audit_logs(actor_user_id uuid,tenant_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);
    CREATE TABLE license_sales(id uuid primary key,tenant_id uuid,partner_id uuid,product_kind text,product_code text,label text,quantity int,cadence text,payment_method text,sale_price numeric,purchase_price numeric,starts_on date,next_period date,ended_on date,request_id uuid,list_sale_price numeric,customer_discount_pct numeric,discount_starts_on date,discount_ends_on date,term_months int,auto_renew boolean,created_at timestamptz default now());
    CREATE TABLE license_sale_corrections(sale_id uuid,after_data jsonb);
    CREATE TABLE license_billing_events(sale_id uuid,period_start date,period_end date,primary key(sale_id,period_start));
    CREATE TABLE partner_customer_invoices(id uuid default gen_random_uuid(),partner_id uuid,tenant_id uuid,source_ref text unique,period_start date,period_end date,amount numeric,line_items jsonb,document_type text,payment_method text,status text default 'draft',issued_at timestamptz);
    CREATE TABLE tenant_invoices(id uuid default gen_random_uuid(),tenant_id uuid,partner_id uuid,source_ref text unique,invoice_number text,invoice_kind text,status text,document_type text,period_start date,period_end date,amount numeric,module_total numeric,support_total numeric,line_items jsonb,issued_at timestamptz,lexware_invoice_id text);
    CREATE FUNCTION license_term_end(p_start date,p_months int) RETURNS date LANGUAGE sql AS $$ SELECT (p_start+make_interval(months=>p_months))::date-1 $$;
    CREATE FUNCTION license_period_end(p_day date,p_cadence text) RETURNS date LANGUAGE sql AS $$ SELECT (date_trunc('month',p_day)+interval '1 month - 1 day')::date $$;
    CREATE TABLE bridge_workers(id uuid); ALTER TABLE bridge_workers ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON bridge_workers TO authenticated; CREATE POLICY "Authenticated users can read bridge_workers" ON bridge_workers FOR SELECT TO authenticated USING(true);
    CREATE TABLE meter_daily_totals_mv_repair_backup_20260617(id int); GRANT ALL ON meter_daily_totals_mv_repair_backup_20260617 TO anon,authenticated;`);
  await db.exec(readFileSync("drizzle/migrations/0062_half_month_billing_partner_discount.sql","utf8").split("ALTER TABLE")[0]);
  const discount = readFileSync("drizzle/migrations/0069_temporary_package_discounts.sql","utf8");
  await db.exec(discount.slice(discount.indexOf("CREATE OR REPLACE FUNCTION public.license_discount_period_amount"),discount.indexOf("CREATE OR REPLACE FUNCTION public.finalize_license_sale_discount")));
  await db.exec(readFileSync("drizzle/migrations/0087_once_payment_term_total.sql","utf8"));
  await db.exec(`CREATE FUNCTION bill_license_sale(p_sale uuid,p_start date,p_supplement boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM tenants t JOIN license_sales s ON t.id=s.tenant_id WHERE s.id=p_sale AND t.setup_status='setup') THEN UPDATE license_sales SET next_period=null WHERE id=p_sale; RETURN; END IF; PERFORM bill_catalog_license_sale(p_sale,p_start,p_supplement); END $$;`);
  const migration = readFileSync("drizzle/migrations/0089_deploy_audit_billing_security.sql","utf8");
  await db.exec(migration); await db.exec(migration);
},30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`DELETE FROM tenants; DELETE FROM license_sales; DELETE FROM license_billing_events; DELETE FROM license_sale_corrections; DELETE FROM tenant_invoices; UPDATE access SET allowed=true;
    INSERT INTO tenants VALUES('${tenant}','Test','setup',null,null);
    INSERT INTO license_sales(id,tenant_id,product_kind,product_code,label,quantity,cadence,sale_price,purchase_price,list_sale_price,starts_on,term_months,auto_renew,ended_on,request_id) VALUES('${sale}','${tenant}','package','p1','Monitoring',1,'once',49,30,49,'2024-01-01',12,false,'2024-12-31','bca3231c-fee5-47f0-83e8-000000000001');`);
});
describe("deploy audit billing and security", () => {
  it("bills an expired provisional setup term for all 12 months only at handover", async () => {
    await db.exec(`SELECT bill_license_sale('${sale}','2024-01-01',true)`);
    expect((await db.query("SELECT * FROM tenant_invoices")).rows).toHaveLength(0);
    await db.exec(`SELECT _finish_tenant_setup('${tenant}',null,'test')`);
    const r = await db.query<{amount:string; status:string}>("SELECT amount,status FROM tenant_invoices");
    const day = Number((await db.query<{dom:number}>("SELECT extract(day from now() AT TIME ZONE 'Europe/Berlin')::int AS dom")).rows[0].dom);
    // Existing rule: each touched half-month costs 24.50 €, including partial endpoints.
    const expected = day === 1 || day === 16 ? 588 : 612.5;
    expect(Number(r.rows[0].amount)).toBe(expected);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].status).toBe("draft");
    expect((await db.query(`SELECT starts_on=(now() AT TIME ZONE 'Europe/Berlin')::date AND ended_on=license_term_end(starts_on,12) ok FROM license_sales`)).rows).toEqual([{ok:true}]);
    await db.exec(`SELECT _finish_tenant_setup('${tenant}',null,'retry')`);
    expect((await db.query("SELECT * FROM tenant_invoices")).rows).toHaveLength(1);
  });
  it("never bills a reversed mistake at handover", async () => {
    await db.exec(`INSERT INTO license_sale_corrections VALUES('${sale}','{"action":"cancel_mistake"}'); SELECT _finish_tenant_setup('${tenant}',null,'test');`);
    expect((await db.query("SELECT * FROM tenant_invoices")).rows).toHaveLength(0);
  });
  it("keeps a future cancellation when enabling renewal or extending a term", async () => {
    await db.exec(`UPDATE tenants SET setup_status='active'; UPDATE license_sales SET cadence='monthly',starts_on=current_date,ended_on=current_date+90; SELECT set_license_sale_term('${sale}',24,true);`);
    expect((await db.query("SELECT ended_on=current_date+90 ok,auto_renew FROM license_sales")).rows).toEqual([{ok:true,auto_renew:false}]);
  });
  it("fails closed when the authorization helper returns NULL", async () => {
    await db.exec("UPDATE access SET allowed=null");
    await expect(db.exec(`SELECT set_license_sale_term('${sale}',12,false)`)).rejects.toThrow("Keine Berechtigung");
  });
  it("blocks anonymous backup access and broad bridge reads after idempotent replay", async () => {
    expect((await db.query(readFileSync("supabase/deploy/deploy-audit-ready.sql","utf8"))).rows).toEqual([{deploy_audit_ready:true}]);
    await db.exec("SET ROLE anon");
    await expect(db.query("SELECT * FROM meter_daily_totals_mv_repair_backup_20260617")).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    expect((await db.query("SELECT * FROM bridge_workers")).rows).toEqual([]);
    await db.exec("RESET ROLE");
  });
});