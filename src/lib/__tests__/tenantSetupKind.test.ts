import { describe, it, expect } from "vitest";
import { resolveSessionKind } from "../../../supabase/functions/_shared/supportSessionKind";

describe("Einrichtungsphase vs. Remote-Support", () => {
  it("erlaubt Einrichtungssitzung ohne Freigabe nur in der Einrichtungsphase", () => {
    expect(resolveSessionKind({ setup_status: "setup", remote_support_enabled: false })).toEqual({ kind: "setup" });
  });
  it("verweigert Zugriff nach Übergabe ohne Kundenfreigabe", () => {
    expect("error" in resolveSessionKind({ setup_status: "active", remote_support_enabled: false })).toBe(true);
  });
  it("nach Übergabe mit Freigabe ist es regulärer Remote-Support", () => {
    expect(resolveSessionKind({ setup_status: "active", remote_support_enabled: true })).toEqual({ kind: "support" });
  });
});
