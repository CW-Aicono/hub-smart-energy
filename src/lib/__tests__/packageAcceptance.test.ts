// Abnahmetests Schritt 6 (netto, monatlich) – Werte aus Dirks Prompt v5.
import { describe, expect, it } from "vitest";
import { computeTenantMonth, monthDelta, type UsageInput } from "../../../supabase/functions/_shared/packageUsage";
import { partnerCustomerLines } from "../../../supabase/functions/_shared/partnerInvoiceFlows";
import { customerInvoiceList, lockedHint } from "../tenantBillingView";

const defs = [
  { code: "p1_monitoring", name: "Monitoring", uvp: 99, ek: 74, always_active: false, modules: ["energy_monitoring"] },
  { code: "p2_analysis", name: "Analyse", uvp: 49, ek: 37, always_active: false, modules: ["reporting"] },
  { code: "p3_automation", name: "Automation", uvp: 79, ek: 59, always_active: false, modules: ["automation"] },
  { code: "p5_flex", name: "Flex", uvp: 99, ek: 74, always_active: false, modules: ["trading"] },
  { code: "p6_enterprise", name: "Enterprise", uvp: 199, ek: 149, always_active: false, modules: ["api"] },
];
const units = { extra_location: { uvp: 39, ek: 29 }, charge_point: { uvp: 8, ek: 6 }, charging_session: { uvp: 0.1, ek: 0.07 }, setup: { uvp: 200, ek: 200 }, support_15min: { uvp: 25, ek: 25 }, remote_support: { uvp: 149, ek: 112 } };
const pk = (...codes: string[]) => codes.map((code) => ({ code, start: "2026-01-01", end: null, viaContract: false }));
const base: UsageInput = { month: "2026-11", partner: true, tenantCreatedAt: "2026-01-05", packages: [], defs, units, locations: 1, chargePoints: 0, billedSessions: 0, remoteSupport: [], supportSessions: [], setupViaContract: false, discounts: [] };
const run = (i: Partial<UsageInput>) => computeTenantMonth({ ...base, ...i });
// Partner verkauft 10 % unter UVP
const tenPct: Record<string, number> = Object.fromEntries([...defs.map((d) => [d.code, d.uvp * 0.9]), ...Object.entries(units).map(([c, u]) => [c, u.uvp * 0.9])]);
const customer = (r: ReturnType<typeof run>) => Math.round(partnerCustomerLines(r.lines as any, tenPct).reduce((s, l) => s + l.amount, 0) * 100) / 100;
const caseB = { packages: pk("p1_monitoring", "p2_analysis"), chargePoints: 12, billedSessions: 100 };

describe("Abnahme Paketabrechnung", () => {
  it("A – direkt, nur Laden: 35,00 €", () => expect(run({ partner: false, chargePoints: 4, billedSessions: 30 }).uvp).toBe(35));
  it("B – Wiederverkauf: 190,00 € an Partner, 228,60 € vom Partner", () => { const r = run(caseB); expect(r.ek).toBe(190); expect(customer(r)).toBe(228.6); });
  it("C – Wiederverkauf: 528,50 € an Partner, 637,20 € vom Partner", () => {
    const r = run({ packages: pk("p1_monitoring", "p2_analysis", "p3_automation", "p5_flex"), locations: 4, chargePoints: 30, billedSessions: 250 });
    expect(r.ek).toBe(528.5); expect(customer(r)).toBe(637.2);
  });
  it("B + Flatrate: 302,00 € an Partner, 362,70 € vom Partner", () => {
    const r = run({ ...caseB, remoteSupport: [{ code: "remote_support", start: "2026-01-01", end: null, viaContract: false }] });
    expect(r.ek).toBe(302); expect(customer(r)).toBe(362.7);
  });
  it("neuer Tenant: + 200,00 € einmalig an Partner", () => expect(run({ ...caseB, tenantCreatedAt: "2026-11-03" }).ek).toBe(390));
  it("anteilig: Paket 1 ab 16. eines 30-Tage-Monats direkt = 49,50 €", () => expect(run({ partner: false, packages: [{ code: "p1_monitoring", start: "2026-11-16", end: null, viaContract: false }] }).uvp).toBe(49.5));
  it("Mengenänderung 12 → 13 Ladepunkte: 196,00 € (+6,00 €), 235,80 € vom Partner", () => {
    const prev = run(caseB), cur = run({ ...caseB, chargePoints: 13 });
    const d = monthDelta(cur, prev);
    expect(cur.ek).toBe(196); expect(d.ek).toBe(6); expect(d.text).toBe("Ladepunkte 12 → 13"); expect(customer(cur)).toBe(235.8);
  });
  it("6. Tenant mit Paket 1 und 2 Ladepunkten: 74 + 12 + 200 € einmalig", () => expect(run({ packages: pk("p1_monitoring"), chargePoints: 2, tenantCreatedAt: "2026-11-10" }).ek).toBe(286));
  it("Support-Sitzung mit 106.780 Minuten wird nicht berechnet, sondern geprüft", () => {
    const r = run({ ...caseB, supportSessions: [{ id: "s", started_at: "2026-11-02T08:00:00Z", ended_at: null, duration_minutes: 106780 }] });
    expect(r.review).toBe(true); expect(r.ek).toBe(190);
  });
  it("Paket 6 setzt Liegenschaftspreis auf 0", () => expect(run({ packages: pk("p1_monitoring", "p6_enterprise"), locations: 8 }).ek).toBe(74 + 149));
});

describe("Kundenansicht Paket & Rechnungen", () => {
  it("zeigt keine EK-Rechnung an den Partner und keine Entwürfe", () => {
    const list = customerInvoiceList(
      [{ id: "1", invoice_number: "AIC-1", issued_at: "2026-11-01", status: "sent", document_type: "invoice", partner_id: null, amount: 35 },
       { id: "2", invoice_number: "AIC-2", issued_at: "2026-11-01", status: "sent", document_type: "invoice", partner_id: "p", amount: 190 },
       { id: "3", invoice_number: "DRAFT", issued_at: null, status: "draft", document_type: "invoice", partner_id: null, amount: 10 }],
      [{ id: "4", invoice_number: "P-1", issued_at: "2026-11-02", status: "issued", document_type: "invoice", amount: 228.6 }],
    );
    expect(list.map((i) => i.number)).toEqual(["P-1", "AIC-1"]);
  });
  it("Hinweis für gesperrte Funktion nennt Paket und Partner", () => expect(lockedHint("Analyse & Energieberichte", "ESB GmbH")).toBe("Im Paket Analyse & Energieberichte enthalten – Anfrage an ESB GmbH"));
});
