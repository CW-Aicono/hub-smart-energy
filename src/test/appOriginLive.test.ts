import { describe, it, expect } from "vitest";
import { safeAuthRedirect, defaultAppOrigin } from "../../supabase/functions/_shared/appOrigin";

describe("Einladungslinks zeigen auf die richtige Umgebung", () => {
  it("Live-Domain ems.aicono.org bleibt im Link erhalten", () => {
    expect(safeAuthRedirect("https://ems.aicono.org/set-password", null, null)).toBe("https://ems.aicono.org/set-password");
  });
  it("Partner-Portal partner.aicono.org bleibt im Link erhalten", () => {
    expect(safeAuthRedirect("https://partner.aicono.org/set-password", null, null)).toBe("https://partner.aicono.org/set-password");
  });
  it("Live-Server fällt auf ems.aicono.org zurück, Lovable Cloud auf Staging", () => {
    expect(defaultAppOrigin("https://api-ems.aicono.org")).toBe("https://ems.aicono.org");
    expect(defaultAppOrigin("https://xnveugycurplszevdxtw.supabase.co")).toBe("https://staging.aicono.org");
  });
});
