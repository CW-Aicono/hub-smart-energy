import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { packagePortfolioState, isPackageUnlocked, modulesToRevoke, partnerCatalogRefresh, saleCatalogPartner } from "./partnerPortfolio";

const links = [
  { package_code: "p1", module_code: "a" }, { package_code: "p1", module_code: "b" },
  { package_code: "p2", module_code: "b" }, { package_code: "p2", module_code: "c" },
];

describe("partner package portfolio", () => {
  it("package is unlocked only when all its modules are in the portfolio", () => {
    expect(isPackageUnlocked("p1", links, ["a", "b"])).toBe(true);
    expect(packagePortfolioState("p1", links, ["a"])).toBe("partial");
    expect(isPackageUnlocked("p1", links, ["a"])).toBe(false);
    expect(packagePortfolioState("p2", links, [])).toBe("off");
  });
  it("revoking a package keeps modules needed by another unlocked package", () => {
    expect(modulesToRevoke("p1", links, ["a", "b", "c"])).toEqual(["a"]);
    expect(modulesToRevoke("p1", links, ["a", "b"])).toEqual(["a", "b"]);
  });
  it("portal tenant booking uses the selected tenant's partner portfolio", () => {
    expect(saleCatalogPartner(undefined, { partner_id: "tenant-partner" })).toBe("tenant-partner");
    expect(saleCatalogPartner(undefined, { partner_id: null })).toBeUndefined();
    expect(saleCatalogPartner("scoped-partner", { partner_id: "other-partner" })).toBe("scoped-partner");
  });
  it("reopening the catalog refreshes a new partner grant despite the dashboard cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
    const key = ["license-sale-catalog", "partner"];
    client.setQueryData(key, ["a"]);
    const loadPortfolio = vi.fn(async () => ["a", "b"]);
    const observer = new QueryObserver(client, { ...partnerCatalogRefresh, queryKey: key, queryFn: loadPortfolio });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(client.getQueryData(key)).toEqual(["a", "b"]));
      expect(loadPortfolio).toHaveBeenCalledTimes(1);
      expect(isPackageUnlocked("p1", links, client.getQueryData<string[]>(key) ?? [])).toBe(true);
    } finally { unsubscribe(); client.clear(); }
  });
});
