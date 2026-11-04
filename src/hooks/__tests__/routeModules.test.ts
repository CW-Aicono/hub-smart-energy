import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { resolveRouteModule } from "@/lib/routeModules";

const root = resolve(__dirname, "../../..");
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const sidebars = ["DashboardSidebar.tsx", "MobileSidebar.tsx"].map((f) =>
  readFileSync(resolve(root, "src/components/dashboard", f), "utf8"),
);

describe("route/module mapping", () => {
  it("energy analysis sub-page needs analytics_studio (sidebar and guard agree)", () => {
    expect(resolveRouteModule("/analytics-studio/analyse")).toEqual({ kind: "module", code: "analytics_studio" });
  });

  it("all charging sub-pages need ev_charging, transactions need adhoc_payment", () => {
    for (const p of ["/charging/users", "/charging/reporting", "/charging/settings", "/charging/points/abc"]) {
      expect(resolveRouteModule(p)).toEqual({ kind: "module", code: "ev_charging" });
    }
    expect(resolveRouteModule("/charging/transactions")).toEqual({ kind: "module", code: "adhoc_payment" });
  });

  it("unknown paths are fail-closed", () => {
    expect(resolveRouteModule("/something-new").kind).toBe("unknown");
  });

  it("every module-guarded route in App.tsx is mapped", () => {
    const paths = [...app.matchAll(/<Route path="([^"]+)" element=\{<M>/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(20);
    const unknown = paths.filter((p) => resolveRouteModule(p.replace(/:[^/]+/g, "x")).kind === "unknown");
    expect(unknown).toEqual([]);
  });

  it("every sidebar link is mapped (no silent always-visible items)", () => {
    const groups = new Set(["/trading"]);
    const links = sidebars.flatMap((s) => [...s.matchAll(/to: "(\/[^"]*)"/g)].map((m) => m[1]));
    const unknown = links.filter((p) => !groups.has(p) && resolveRouteModule(p).kind === "unknown");
    expect(unknown).toEqual([]);
  });
});
