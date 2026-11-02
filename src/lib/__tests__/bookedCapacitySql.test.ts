import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
const db = new PGlite();
const tenant = '10000000-0000-4000-8000-000000000001';
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE tenants(id uuid primary key,charge_point_capacity_managed boolean default false,location_capacity_managed boolean default false);
 CREATE TABLE license_sales(id uuid default gen_random_uuid(),tenant_id uuid,product_kind text,product_code text,quantity int,ended_on date);
 CREATE TABLE tenant_package_bookings(tenant_id uuid,package_code text,cancelled_at timestamptz);
 CREATE TABLE charge_points(id uuid default gen_random_uuid(),tenant_id uuid);
 CREATE TABLE locations(id uuid default gen_random_uuid(),tenant_id uuid,is_archived boolean default false);
 INSERT INTO tenants(id) VALUES('${tenant}');`);
 const sql=readFileSync('drizzle/migrations/0067_booked_capacity_limits.sql','utf8');
 await db.exec(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.booked_tenant_capacity')));
},30000);
afterAll(async()=>{await db.close();});
it('permits exactly two booked charge points, blocks a third, allows a top-up',async()=>{
 await db.exec(`INSERT INTO license_sales(tenant_id,product_kind,product_code,quantity) VALUES('${tenant}','unit','charge_point',2);
 INSERT INTO charge_points(tenant_id) VALUES('${tenant}'),('${tenant}');`);
 await expect(db.exec(`INSERT INTO charge_points(tenant_id) VALUES('${tenant}')`)).rejects.toThrow('ausgeschöpft');
 await db.exec(`INSERT INTO license_sales(tenant_id,product_kind,product_code,quantity) VALUES('${tenant}','unit','charge_point',1); INSERT INTO charge_points(tenant_id) VALUES('${tenant}');`);
 expect((await db.query<{count:number}>('SELECT count(*)::int count FROM charge_points')).rows[0].count).toBe(3);
});
it('includes one base site plus two booked sites, blocks a fourth and restoration',async()=>{
 await db.exec(`INSERT INTO license_sales(tenant_id,product_kind,product_code,quantity) VALUES('${tenant}','unit','extra_location',2); INSERT INTO locations(tenant_id) VALUES('${tenant}'),('${tenant}'),('${tenant}'); INSERT INTO locations(tenant_id,is_archived) VALUES('${tenant}',true);`);
 await expect(db.exec(`INSERT INTO locations(tenant_id) VALUES('${tenant}')`)).rejects.toThrow('ausgeschöpft');
 await expect(db.exec(`UPDATE locations SET is_archived=false WHERE is_archived`)).rejects.toThrow('ausgeschöpft');
});
it('enterprise retains unlimited sites',async()=>{
 await db.exec(`INSERT INTO license_sales(tenant_id,product_kind,product_code,quantity) VALUES('${tenant}','package','p6_enterprise',1); INSERT INTO locations(tenant_id) VALUES('${tenant}');`);
 expect((await db.query<{count:number}>('SELECT count(*)::int count FROM locations WHERE NOT is_archived')).rows[0].count).toBe(4);
});
it('does not cap existing tenants without quantity bookings',async()=>{
 const legacy='10000000-0000-4000-8000-000000000002';
 await db.exec(`INSERT INTO tenants(id) VALUES('${legacy}'); INSERT INTO charge_points(tenant_id) SELECT '${legacy}'::uuid FROM generate_series(1,20);`);
 expect((await db.query<{count:number}>(`SELECT count(*)::int count FROM charge_points WHERE tenant_id='${legacy}'`)).rows[0].count).toBe(20);
});
it('expired bookings do not allow new charge points',async()=>{
 await db.exec(`UPDATE license_sales SET ended_on='2000-01-01' WHERE product_code='charge_point';`);
 await expect(db.exec(`INSERT INTO charge_points(tenant_id) VALUES('${tenant}')`)).rejects.toThrow('ausgeschöpft');
});
