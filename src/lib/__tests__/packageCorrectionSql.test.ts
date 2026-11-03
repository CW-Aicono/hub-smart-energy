import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
const db = new PGlite();
const tenant = "10000000-0000-4000-8000-000000000001", sale = "30000000-0000-4000-8000-000000000001";
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '90000000-0000-4000-8000-000000000001'::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
 CREATE FUNCTION can_portal_write(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE FUNCTION can_portal_read(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE FUNCTION can_manage_partner_billing(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE TABLE tenants(id uuid PRIMARY KEY,name text,partner_id uuid);
 CREATE TABLE profiles(id uuid,tenant_id uuid); CREATE TABLE support_sessions(super_admin_user_id uuid,tenant_id uuid,ended_at timestamptz);
 CREATE TABLE pricing_packages(code text,uvp numeric,always_active boolean); CREATE TABLE pricing_unit_prices(code text,uvp numeric,new_sale_uvp numeric);
 CREATE TABLE pricing_package_modules(package_code text,module_code text); CREATE TABLE tenant_package_bookings(tenant_id uuid,package_code text,cancelled_at timestamptz);
 CREATE TABLE tenant_modules(tenant_id uuid,module_code text,is_enabled boolean,individual_grant boolean);
 CREATE TABLE charge_points(tenant_id uuid); CREATE TABLE locations(tenant_id uuid,is_archived boolean);
 CREATE TABLE license_sales(id uuid PRIMARY KEY,tenant_id uuid,partner_id uuid,product_kind text,product_code text,label text,quantity int,cadence text,payment_method text,sale_price numeric,purchase_price numeric,starts_on date,next_period date,ended_on date,request_id uuid,list_sale_price numeric,customer_discount_pct numeric,price_individual boolean,price_reason text,auto_renew boolean);
 CREATE TABLE license_billing_events(sale_id uuid,period_start date,period_end date,PRIMARY KEY(sale_id,period_start));
 CREATE TABLE partner_customer_invoices(id uuid default gen_random_uuid(),partner_id uuid,tenant_id uuid,source_ref text unique,period_start date,period_end date,amount numeric,line_items jsonb,document_type text,payment_method text,status text default 'draft',issued_at timestamptz);
 CREATE TABLE tenant_invoices(id uuid default gen_random_uuid(),tenant_id uuid,partner_id uuid,source_ref text unique,invoice_number text,invoice_kind text,status text,document_type text,period_start date,period_end date,amount numeric,module_total numeric,support_total numeric,line_items jsonb,issued_at timestamptz,lexware_invoice_id text);
 CREATE FUNCTION license_period_end(p_day date,p_cadence text) RETURNS date LANGUAGE sql AS $$ SELECT (date_trunc('month',p_day)+interval '1 month - 1 day')::date $$;
 CREATE FUNCTION booked_tenant_capacity(uuid,text) RETURNS int LANGUAGE sql AS $$ SELECT 10 $$;
 CREATE FUNCTION preflight_license_sale(uuid,text,text,int,text,numeric,date,text,uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
 CREATE FUNCTION create_custom_invoice_sale(uuid,jsonb,text,text,uuid,date) RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;`);
 await db.exec(readFileSync("drizzle/migrations/0062_half_month_billing_partner_discount.sql","utf8").split("ALTER TABLE")[0]);
 const old = readFileSync("drizzle/migrations/0069_temporary_package_discounts.sql","utf8"); await db.exec(old.slice(0,old.indexOf("CREATE OR REPLACE FUNCTION public.finalize_license_sale_discount")));
 await db.exec(`CREATE FUNCTION bill_license_sale(uuid,date,boolean) RETURNS void LANGUAGE sql AS $$ SELECT bill_catalog_license_sale($1,$2,$3) $$;`);
 for (const name of ["0074_package_sale_corrections_yearly","0075_package_effective_entitlements","0076_package_correction_security_guard","0077_package_correction_collective_invoice_guard"]) await db.exec(readFileSync(`drizzle/migrations/${name}.sql`,"utf8"));
 await db.exec(`INSERT INTO tenants VALUES('${tenant}','Test',null); INSERT INTO pricing_packages VALUES('p1',99,false); INSERT INTO pricing_package_modules VALUES('p1','automation_building'); INSERT INTO tenant_modules VALUES('${tenant}','automation_building',true,false);
 INSERT INTO license_sales(id,tenant_id,product_kind,product_code,label,quantity,cadence,payment_method,sale_price,purchase_price,starts_on,request_id,list_sale_price,customer_discount_pct) VALUES('${sale}','${tenant}','package','p1','Test package',1,'monthly','invoice',99,74,'2026-11-01','bca3231c-fee5-47f0-83e8-000000000001',99,0); SELECT bill_license_sale('${sale}','2026-11-01',true);`);
},30000);
afterAll(async()=>{await db.close();});
it("corrects the package draft to 49 euros without changing 74 euro EK or duplicating events",async()=>{
 await db.exec(`SELECT correct_license_sale('${sale}',49,1,'monthly',50.51,null,null,'continue','Test correction');`);
 expect(Number((await db.query<any>("SELECT amount FROM tenant_invoices")).rows[0].amount)).toBe(49);
 expect(Number((await db.query<any>("SELECT purchase_price FROM license_sales")).rows[0].purchase_price)).toBe(74);
 expect((await db.query<any>("SELECT count(*)::int n FROM license_billing_events")).rows[0].n).toBe(1);
});
it("protects issued invoices and applies price changes only to future bills",async()=>{
 await db.exec("UPDATE tenant_invoices SET issued_at=now(),status='issued';");
 await db.exec(`SELECT correct_license_sale('${sale}',50,1,'monthly',49.49,null,null,'continue','Future correction');`);
 expect(Number((await db.query<any>("SELECT amount FROM tenant_invoices")).rows[0].amount)).toBe(49);
 await expect(db.exec(`SELECT correct_license_sale('${sale}',50,1,'yearly',0,null,null,'continue','Invalid cadence correction');`)).rejects.toThrow('Ausgestellte Rechnung');
});
it("expires entitlements without deleting modules and restores them on renewed coverage",async()=>{
 await db.exec(`UPDATE license_sales SET ended_on='2000-01-01' WHERE id='${sale}';`);
 expect((await db.query<any>(`SELECT is_enabled FROM effective_tenant_modules('${tenant}')`)).rows[0].is_enabled).toBe(false);
 expect((await db.query<any>("SELECT is_enabled FROM tenant_modules")).rows[0].is_enabled).toBe(true);
 await db.exec(`UPDATE license_sales SET ended_on=null WHERE id='${sale}';`);
 expect((await db.query<any>(`SELECT is_enabled FROM effective_tenant_modules('${tenant}')`)).rows[0].is_enabled).toBe(true);
});
it("calculates yearly billing to December 31 and 600 euros for twelve months at 50 euros",async()=>{
 expect((await db.query<any>("SELECT license_period_end('2028-02-16','yearly')::text e,license_period_amount(50,1,'2027-01-01','2027-12-31','yearly') a")).rows[0]).toEqual({e:"2028-12-31",a:"600.00"});
});