import { describe, it, expect } from "vitest";
import { calculateQuote, checkDependencies, priceViews, type PackageDef, type UnitPrice } from "../packagePricing";

const defs: PackageDef[] = [
  { code: "basis", name: "Basis", uvp: 0, ek: 0, requires_package: null, requires_any_other: false, always_active: true },
  { code: "p1_monitoring", name: "Monitoring", uvp: 99, ek: 74, requires_package: null, requires_any_other: false, always_active: false },
  { code: "p2_analysis", name: "Analyse", uvp: 49, ek: 37, requires_package: "p1_monitoring", requires_any_other: false, always_active: false },
  { code: "p3_automation", name: "Automation", uvp: 79, ek: 59, requires_package: "p1_monitoring", requires_any_other: false, always_active: false },
  { code: "p4_charging", name: "Laden", uvp: 0, ek: 0, requires_package: null, requires_any_other: false, always_active: false },
  { code: "p5_flex", name: "Flex", uvp: 99, ek: 74, requires_package: "p1_monitoring", requires_any_other: false, always_active: false },
  { code: "p6_enterprise", name: "Enterprise", uvp: 199, ek: 149, requires_package: null, requires_any_other: true, always_active: false },
];
const units: UnitPrice[] = [
  { code: "extra_location", uvp: 39, ek: 29 },
  { code: "charge_point", uvp: 7, ek: 5.25 },
  { code: "charging_session", uvp: 0.1, ek: 0.07 },
];

describe("packagePricing acceptance", () => {
  it("nur Laden: 31,00 € UVP", () => {
    expect(calculateQuote({ packages: ["basis", "p4_charging"], locations: 1, chargePoints: 4, billedSessions: 30 }, defs, units).uvp).toBe(31);
  });
  it("Pakete 1+2: 242 € UVP / 181 € EK", () => {
    const r = calculateQuote({ packages: ["p1_monitoring", "p2_analysis"], locations: 1, chargePoints: 12, billedSessions: 100 }, defs, units);
    expect([r.uvp, r.ek]).toEqual([242, 181]);
  });
  it("Pakete 1+2+3+5, 4 Liegenschaften: 678 € UVP / 506 € EK", () => {
    const r = calculateQuote({ packages: ["p1_monitoring", "p2_analysis", "p3_automation", "p5_flex"], locations: 4, chargePoints: 30, billedSessions: 250 }, defs, units);
    expect([r.uvp, r.ek]).toEqual([678, 506]);
  });
  it("Paket 6 entfernt Liegenschaftszuschlag", () => {
    const r = calculateQuote({ packages: ["p1_monitoring", "p6_enterprise"], locations: 5, chargePoints: 0, billedSessions: 0 }, defs, units);
    expect(r.uvp).toBe(298);
  });
});

describe("Abhängigkeiten", () => {
  it("Paket 2 ohne Paket 1 ist gesperrt", () => {
    expect(checkDependencies(["p2_analysis"], defs)).toHaveLength(1);
  });
  it("Paket 6 allein ist gesperrt, mit Paket 4 erlaubt", () => {
    expect(checkDependencies(["basis", "p6_enterprise"], defs)).toHaveLength(1);
    expect(checkDependencies(["p4_charging", "p6_enterprise"], defs)).toHaveLength(0);
  });
});

describe("Preissichten", () => {
  it("Rabatt und Aufschlag beschreiben denselben Endpreis, Warnung unter EK", () => {
    expect(priceViews(90, 100, 75)).toEqual({ discountOnUvpPct: 10, markupOnEkPct: 20, belowEk: false });
    expect(priceViews(70, 100, 75).belowEk).toBe(true);
  });
});

import { proRataAmount } from "../packagePricing";
describe("proRataAmount", () => {
  it("bucht am 15. Oktober 17 von 31 Tagen", () => {
    expect(proRataAmount(99, new Date(Date.UTC(2026, 9, 15)))).toBe(54.29);
  });
  it("bucht am Monatsersten den vollen Monat", () => {
    expect(proRataAmount(99, new Date(Date.UTC(2026, 9, 1)))).toBe(99);
  });
  it("bucht am letzten Februartag einen Tag", () => {
    expect(proRataAmount(28, new Date(Date.UTC(2026, 1, 28)))).toBe(1);
  });
});
