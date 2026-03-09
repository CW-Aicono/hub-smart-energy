import { describe, it, expect } from "vitest";

describe("DashboardContent page", () => {
  it("module exports a default component", async () => {
    const mod = await import("../DashboardContent");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
