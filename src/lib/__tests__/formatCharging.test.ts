import { describe, it, expect } from "vitest";
import { fmtNum, fmtCurrency, fmtKwh, fmtKw } from "../formatCharging";

describe("fmtNum", () => {
  it("formats with 2 decimals by default", () => {
    expect(fmtNum(1234.5)).toContain("1.234,50");
  });

  it("uses custom decimal places", () => {
    expect(fmtNum(1234.5, 0)).toBe("1.235");
  });
});

describe("fmtCurrency", () => {
  it("appends € symbol", () => {
    expect(fmtCurrency(42)).toContain("€");
    expect(fmtCurrency(42)).toContain("42,00");
  });
});

describe("fmtKwh", () => {
  it("appends kWh unit", () => {
    expect(fmtKwh(100)).toContain("kWh");
  });
});

describe("fmtKw", () => {
  it("appends kW unit with 1 decimal", () => {
    expect(fmtKw(22)).toContain("kW");
    expect(fmtKw(22)).toContain("22,0");
  });
});
