import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
describe("Zugangsmail erst bei Übergabe", () => {
  it("Einladungsfunktion verweigert Tenants in Einrichtung", () => {
    const fn = readFileSync("supabase/functions/invite-tenant-admin/index.ts", "utf8");
    expect(fn).toMatch(/setup_status === "setup"\) \{\s*throw new Error/);
  });
  it("Anlage lädt nicht mehr sofort ein", () => {
    for (const f of ["src/pages/partner/PartnerTenants.tsx", "src/pages/SuperAdminTenants.tsx"]) {
      expect(readFileSync(f, "utf8")).not.toContain('invoke("invite-tenant-admin"');
    }
  });
});
