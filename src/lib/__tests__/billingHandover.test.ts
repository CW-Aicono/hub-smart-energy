import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const sql = readFileSync("drizzle/migrations/0085_billing_starts_at_handover.sql", "utf8");
describe("Abrechnung erst bei Übergabe", () => {
  it("keine Rechnung für Tenants in Einrichtung", () => {
    expect(sql).toMatch(/setup_status='setup'\) THEN\s+UPDATE license_sales SET next_period=NULL WHERE id=s.id; RETURN;/);
  });
  it("Übergabe setzt Startdatum auf Übergabetag und rechnet ab", () => {
    expect(sql).toMatch(/SET starts_on = v_today, next_period = v_today/);
    expect(sql).toMatch(/PERFORM public.bill_license_sale\(s.id, v_today, true\)/);
  });
  it("Einrichtungsgebühr nur beim Wechsel setup -> active", () => {
    expect(sql).toMatch(/TG_OP='INSERT' AND coalesce\(NEW.setup_status,'setup'\)='setup' THEN RETURN NEW/);
    expect(sql).toMatch(/AFTER UPDATE OF setup_status ON public.tenants/);
  });
});
