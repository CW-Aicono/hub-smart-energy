import { describe, it, expect } from "vitest";
import { packagePortfolioState, isPackageUnlocked, modulesToRevoke } from "./partnerPortfolio";

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
});
