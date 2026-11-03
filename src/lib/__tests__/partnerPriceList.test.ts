import { describe, expect, it } from "vitest";
import { partnerPriceRows, discountOptions, packageMargin, expectedCommission, openPurchaseTotal, saleFromLines } from "../partnerPriceList";

const packages = [
  { code: "basis", name: "Basis", uvp: 0, ek: 0, always_active: true, sort: 0 },
  { code: "p1_monitoring", name: "Monitoring & Alarmierung", uvp: 99, ek: 74, sort: 1 },
  { code: "p2_analysis", name: "Analyse", uvp: 49, ek: 37, sort: 2 },
  { code: "p4_charging", name: "Ladeinfrastruktur", uvp: 0, ek: 0, sort: 4 },
  { code: "p6_enterprise", name: "Multi-Site", uvp: 199, ek: 149, sort: 6 },
];
const units = [
  { code: "charge_point", name: "Ladepunkt", uvp: 7, ek: 6, new_sale_uvp: 8 },
  { code: "remote_support", name: "Remote-Support", uvp: 149, ek: 112 },
  { code: "extra_location", name: "Weitere Liegenschaft", uvp: 39, ek: 29 },
];
const uvpOf = (c: string) => ({ p1_monitoring: 99, p2_analysis: 49, charge_point: 8 } as Record<string, number>)[c] ?? 0;

describe("partner price list", () => {
  it("lists P1 with EK 74, UVP 99 and margin 25 without own price", () => {
    const r = partnerPriceRows(packages, units, [], "kommune").find((x) => x.code === "p1_monitoring")!;
    expect([r.ek, r.uvp, r.sale, r.margin]).toEqual([74, 99, 99, 25]);
  });
  it("charge point uses current sale UVP 8 EUR and EK 6 EUR", () => {
    const r = partnerPriceRows(packages, units, [], "kommune").find((x) => x.code === "charge_point")!;
    expect([r.ek, r.uvp, r.margin]).toEqual([6, 8, 2]);
  });
  it("own industry price 89 EUR gives 15 EUR margin only in industry segment", () => {
    const o = [{ module_code: "p1_monitoring", sale_price_monthly: null, sale_price_industry_monthly: 89 }];
    expect(partnerPriceRows(packages, units, o, "industrie").find((x) => x.code === "p1_monitoring")!.margin).toBe(15);
    expect(partnerPriceRows(packages, units, o, "kommune").find((x) => x.code === "p1_monitoring")!.margin).toBe(25);
  });
  it("hides Basis and Ladeinfrastruktur package", () => {
    const codes = partnerPriceRows(packages, units, [], "kommune").map((r) => r.code);
    expect(codes).not.toContain("basis");
    expect(codes).not.toContain("p4_charging");
  });
  it("discount choice offers packages, unit prices and remote-support flatrate, no single modules", () => {
    expect(discountOptions(packages, units).map((o) => o.code)).toEqual(["p1_monitoring", "p2_analysis", "p6_enterprise", "extra_location", "charge_point", "remote_support"]);
  });
});

describe("tenant margin on package basis", () => {
  const lines = [
    { code: "p1_monitoring", type: "package", quantity: 1, uvp: 99, ek: 74 },
    { code: "charge_point", type: "package_unit", quantity: 5, uvp: 40, ek: 30 },
    { code: "discount", type: "discount", quantity: 1, uvp: 0, ek: -7.4 },
  ];
  const row = { tenant_id: "t", tenant_name: "T", packageBilling: true, legacy: false, packages: ["p1_monitoring"], lines, uvp: 139, ek: 96.6 };
  it("own price 109 EUR for P1 and approved discount give margin 52.40 EUR", () => {
    const m = packageMargin(row, (c) => (c === "p1_monitoring" ? 109 : null), uvpOf);
    expect(m).toEqual({ ek: 96.6, sale: 149, margin: 52.4 });
  });
  it("prorated half month uses half of own price", () => {
    expect(saleFromLines([{ code: "p1_monitoring", type: "package", quantity: 1, uvp: 49.5, ek: 37 }], () => 110, uvpOf)).toBe(55);
  });
  it("lines marked for review are not counted", () => {
    expect(saleFromLines([{ code: "support_15min", type: "support", quantity: 96, uvp: 2400, ek: 2400, review: true }], () => null, uvpOf)).toBe(0);
  });
});

describe("commission and open billing", () => {
  it("20 % commission on 139 EUR UVP is 27.80 EUR", () => expect(expectedCommission(139, 20)).toBe(27.8));
  it("open billing sums only issued, unpaid purchase invoices", () => {
    const r = openPurchaseTotal([
      { status: "sent", document_type: "invoice", amount: 100 },
      { status: "draft", document_type: "invoice", amount: 50 },
      { status: "paid", document_type: "invoice", amount: 30 },
      { status: "sent", document_type: "credit_note", amount: 20 },
      { status: "issued", document_type: "invoice", amount: 12.5 },
    ]);
    expect(r).toEqual({ count: 2, total: 112.5 });
  });
});
