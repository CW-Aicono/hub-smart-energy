// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
const db = new PGlite();
const tenant = "10000000-0000-4000-8000-000000000001", partner = "20000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE tenants(id uuid primary key,name text);
    CREATE TABLE license_sales(id uuid primary key,tenant_id uuid,partner_id uuid,product_code text,label text,quantity int,cadence text,payment_method text,sale_price numeric,purchase_price numeric,starts_on date,next_period date,ended_on date,request_id uuid);
    CREATE TABLE license_billing_events(sale_id uuid,period_start date,period_end date,primary key(sale_id,period_start));
    CREATE TABLE partner_customer_invoices(id uuid default gen_random_uuid(),partner_id uuid,tenant_id uuid,source_ref text unique,period_start date,period_end date,amount numeric,line_items jsonb,document_type text,payment_method text,status text default 'draft',issued_at timestamptz);
    CREATE TABLE tenant_invoices(id uuid default gen_random_uuid(),tenant_id uuid,partner_id uuid,source_ref text unique,invoice_number text,invoice_kind text,status text,document_type text,period_start date,period_end date,amount numeric,module_total numeric,support_total numeric,line_items jsonb,issued_at timestamptz,lexware_invoice_id text);
    CREATE FUNCTION license_period_end(d date,c text) RETURNS date LANGUAGE sql AS $$ SELECT CASE WHEN c='once' THEN d ELSE (date_trunc('month',d)+interval '1 month - 1 day')::date END $$;
    CREATE FUNCTION license_period_amount(p numeric,q int,s date,e date,c text) RETURNS numeric LANGUAGE sql AS $$ SELECT p*q $$;
    INSERT INTO tenants VALUES('${tenant}','Test');`);
  await db.exec(readFileSync("drizzle/migrations/0066_combined_package_invoices.sql", "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });
async function add(n: number, price: number, ek: number, cadence = "monthly", batch = "bca3231c") {
  const id = `30000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
  await db.query(`INSERT INTO license_sales(id,tenant_id,partner_id,product_code,label,quantity,cadence,payment_method,sale_price,purchase_price,starts_on,request_id) VALUES($1,$2,$3,'p1','Package',1,$4,'invoice',$5,$6,'2026-11-02',$7)`, [id,tenant,partner,cadence,price,ek,`${batch}-fee5-47f0-83e8-${String(n).padStart(12,"0")}`]);
  await db.query("select bill_catalog_license_sale($1,'2026-11-02',true)", [id]);
  return id;
}
describe("combined booking invoice SQL", () => {
  it("combines simultaneously booked packages and setup into ONE customer invoice with separate EK", async () => {
    await add(1,99,74); await add(2,79,59); await add(3,200,150,"once");
    const {rows} = await db.query<any>("select amount,jsonb_array_length(line_items) lines,period_end from partner_customer_invoices");
    expect(rows).toEqual([{amount:"378",lines:3,period_end:"2026-11-30"}]);
    const wholesale = await db.query<any>("select amount from tenant_invoices"); expect(wholesale.rows).toEqual([{amount:"283"}]);
  });
  it("does not add duplicate lines or amounts when a booking is retried", async () => {
    await db.exec("select bill_catalog_license_sale('30000000-0000-4000-8000-000000000001','2026-11-02',true)");
    expect((await db.query<any>("select amount,jsonb_array_length(line_items) lines from partner_customer_invoices")).rows).toEqual([{amount:"378",lines:3}]);
  });
  it("does not change issued invoices when another item is added", async () => {
    await db.exec("update partner_customer_invoices set status='issued',issued_at=now()");
    await add(4,149,112);
    expect((await db.query<any>("select amount from partner_customer_invoices where issued_at is not null")).rows).toEqual([{amount:"378"}]);
    expect((await db.query<any>("select amount from partner_customer_invoices where status='draft'")).rows).toEqual([{amount:"149"}]);
  });
  it("keeps a separate booking separate", async () => {
    await add(5,99,74,"monthly","aca3231c");
    expect((await db.query<any>("select count(*)::int count from partner_customer_invoices")).rows[0].count).toBe(3);
  });
  it("combines same-date recurring items without billing the once-only setup again", async () => {
    await db.exec("select bill_catalog_license_sale('30000000-0000-4000-8000-000000000001','2026-12-01',false); select bill_catalog_license_sale('30000000-0000-4000-8000-000000000002','2026-12-01',false);");
    expect((await db.query<any>("select amount,jsonb_array_length(line_items) lines from partner_customer_invoices where period_start='2026-12-01'")).rows).toEqual([{amount:"178",lines:2}]);
  });
});