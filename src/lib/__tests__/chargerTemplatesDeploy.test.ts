import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const read = (file: string) => readFileSync(file, "utf8");
const files = ["0072_charger_templates_variants.sql", "0073_vestel_modbus_registers.sql", "0082_vestel_modbus_spec_v115.sql"];
const ready = async () => {
  await db.exec(read("supabase/deploy/charger-templates-ready.sql"));
  return (await db.query<{ready: boolean}>("SELECT pg_temp.charger_templates_ready() AS ready")).rows[0].ready;
};
const repair = async () => { for (const file of files) await db.exec(read(`drizzle/migrations/${file}`)); };
beforeAll(async () => {
  await db.exec(`
    CREATE TABLE public.wallbox_modbus_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vendor text,model text,default_unit_id int,default_port int,notes text,is_active boolean,read_map jsonb,write_map jsonb,status_map jsonb,version int DEFAULT 1,updated_at timestamptz DEFAULT now());
    CREATE TABLE public.charger_models(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vendor text,model text,protocol text,charging_type text,power_kw numeric,is_active boolean,notes text);
    CREATE TABLE public.charge_points(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,connector_type text,connector_count int,max_power_kw numeric);
    INSERT INTO charger_models(vendor,model,power_kw,is_active) VALUES ('ELMI Power','All-in-One 180',180,true),('ELMI Power','All-in-One 360',360,true);
    INSERT INTO charge_points(id,tenant_id,connector_type,connector_count,max_power_kw) VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Type2',1,22);
  `);
},30000);
afterAll(async () => { await db.close(); });
describe("charger template actual-state deploy contract", () => {
  it("missing charger_model_id and variants fail readiness without a SQL error", async () => {
    expect(await ready()).toBe(false);
  });
  it("replays 0072/0073/0082 and supports both manual and ELMI creation", async () => {
    await repair();
    expect(await ready()).toBe(true);
    await db.exec(`INSERT INTO charge_points(charger_model_id,charger_variant,connector_type,connector_count,max_power_kw) VALUES(NULL,NULL,'Type2',1,22);
      INSERT INTO charge_points(charger_model_id,charger_variant,connector_type,connector_count,max_power_kw)
      SELECT id,'standard','Type2',1,500 FROM charger_models WHERE model='All-in-One 180';`);
    expect((await db.query("SELECT connector_type,max_power_kw::int,cable_attached,supports_connector_lock FROM charge_points WHERE charger_variant='standard'")).rows).toEqual([{connector_type:"CCS",max_power_kw:180,cable_attached:true,supports_connector_lock:false}]);
  });
  it("detects old FC 0x03 and restores FC 0x04 without altering stations", async () => {
    const before = (await db.query("SELECT * FROM charge_points ORDER BY id")).rows;
    await db.exec(read(`drizzle/migrations/${files[1]}`));
    expect(await ready()).toBe(false);
    await repair();
    expect(await ready()).toBe(true);
    expect((await db.query("SELECT * FROM charge_points ORDER BY id")).rows).toEqual(before);
    expect((await db.query("SELECT DISTINCT r->>'function_code' AS code FROM wallbox_modbus_templates w, jsonb_array_elements(w.read_map) r WHERE w.vendor='Vestel'")).rows).toEqual([{code:"4"}]);
  });
  it("detects a disabled enforcement trigger and reinstalls it", async () => {
    await db.exec("ALTER TABLE charge_points DISABLE TRIGGER trg_enforce_charger_template");
    expect(await ready()).toBe(false);
    await repair(); expect(await ready()).toBe(true);
  });
  it("fails closed for missing ELMI catalog seeds instead of silently activating", async () => {
    await db.exec("DELETE FROM charger_models WHERE model='All-in-One 360'");
    await repair(); expect(await ready()).toBe(false);
  });
});