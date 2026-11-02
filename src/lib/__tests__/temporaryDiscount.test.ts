import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { discountPeriodAmount, discountWindowValid } from "../licenseBilling";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE tenants(id uuid primary key,name text);
    CREATE TABLE license_sales(id uuid primary key,tenant_id uuid,partner_id uuid,product_code text,label text,quantity int,cadence text,payment_method text,sale_price numeric,purchase_price numeric,starts_on date,next_period date,ended_on date,request_id uuid,list_sale_price numeric,customer_discount_pct numeric);
    CREATE TABLE license_billing_events(sale_id uuid,period_start date,period_end date,primary key(sale_id,period_start));
    CREATE TABLE partner_customer_invoices(id uuid default gen_random_uuid(),partner_id uuid,tenant_id uuid,source_ref text unique,period_start date,period_end date,amount numeric,line_items jsonb,document_type text,payment_method text,status text default 'draft',issued_at timestamptz);
    CREATE TABLE tenant_invoices(id uuid default gen_random_uuid(),tenant_id uuid,partner_id uuid,source_ref text unique,invoice_number text,invoice_kind text,status text,document_type text,period_start date,period_end date,amount numeric,module_total numeric,support_total numeric,line_items jsonb,issued_at timestamptz,lexware_invoice_id text);
    CREATE FUNCTION license_period_end(d date,c text) RETURNS date LANGUAGE sql AS $$ SELECT (date_trunc('month',d)+interval '1 month - 1 day')::date $$;`);
  const half = readFileSync("drizzle/migrations/0062_half_month_billing_partner_discount.sql", "utf8").split("ALTER TABLE")[0];
  await db.exec(half);
  // The finalizer is exercised through the hosted authenticated booking; local SQL tests cover its shared pricing and invoice function.
  const migration = readFileSync("drizzle/migrations/0069_temporary_package_discounts.sql", "utf8");
  await db.exec(migration.slice(0, migration.indexOf("CREATE OR REPLACE FUNCTION public.finalize_license_sale_discount")));
}, 30000);
afterAll(async () => { await db.close(); });
describe("temporary package discount", () => {
  it("accepts only ordered half-month windows from package start", () => {
    expect(discountWindowValid("2026-11-16", "2026-12-15", "2026-11-02")).toBe(true);
    expect(discountWindowValid("2026-11-02", "2026-12-15", "2026-11-02")).toBe(false);
    expect(discountWindowValid("2026-11-01", "2026-12-15", "2026-11-02")).toBe(false);
    expect(discountWindowValid("2026-12-16", "2026-12-15", "2026-11-02")).toBe(false);
  });
  it("applies discount only inside the period, matching SQL and preview for quantities", async () => {
    for (const [from, to, expected] of [["2026-11-02", "2026-11-30", 30.4], ["2026-12-01", "2026-12-31", 30.4], ["2027-01-01", "2027-01-31", 32]] as const) {
      expect(discountPeriodAmount(7.2, 8, 4, from, to, "monthly", "2026-11-16", "2026-12-15")).toBe(expected);
      const result = await db.query<{ amount: string }>("select license_discount_period_amount(7.2,8,4,$1,$2,'monthly','2026-11-16','2026-12-15') amount", [from, to]);
      expect(Number(result.rows[0]?.amount)).toBe(expected);
    }
  });
  it("prices a cross-window quarterly period once per half-month", () => {
    expect(discountPeriodAmount(90, 100, 1, "2026-11-02", "2026-12-31", "quarterly", "2026-11-16", "2026-12-15")).toBe(190);
  });
  it("preserves permanent legacy prices without a discount window", async () => {
    expect(discountPeriodAmount(90,100,1,"2026-11-02","2026-11-30","monthly")).toBe(90);
    expect(Number((await db.query<{amount:string}>("select license_discount_period_amount(90,100,1,'2026-11-02','2026-11-30','monthly',null,null) amount")).rows[0]?.amount)).toBe(90);
  });
  it("creates one customer draft at discounted VK with unchanged partner EK and restores VK on following bills", async () => {
    await db.exec(`INSERT INTO tenants VALUES('10000000-0000-4000-8000-000000000001','Test');
      INSERT INTO license_sales(id,tenant_id,partner_id,product_code,label,quantity,cadence,payment_method,sale_price,purchase_price,starts_on,request_id,list_sale_price,customer_discount_pct,discount_starts_on,discount_ends_on) VALUES
      ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','charge_point','Points',4,'monthly','invoice',7.2,6,'2026-11-02','bca3231c-fee5-47f0-83e8-000000000001',8,10,'2026-11-16','2026-12-15');
      SELECT bill_catalog_license_sale('30000000-0000-4000-8000-000000000001','2026-11-02',true);
      SELECT bill_catalog_license_sale('30000000-0000-4000-8000-000000000001','2027-01-01',false);`);
    const customer = await db.query<{amount:string}>("select amount from partner_customer_invoices order by period_start");
    expect(customer.rows.map(x => Number(x.amount))).toEqual([30.4,32]);
    const wholesale = await db.query<{amount:string}>("select amount from tenant_invoices order by period_start");
    expect(wholesale.rows.map(x => Number(x.amount))).toEqual([24,24]);
  });
});