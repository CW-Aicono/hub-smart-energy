import { describe, expect, it } from "vitest";
import { buildCollective, commissionCredit, directDraftWarnings, mergeCustomLines, partnerCustomerLines, routeTenant } from "../../../supabase/functions/_shared/partnerInvoiceFlows";

const esb = { id: "p1", name: "ESB", billing_mode: "wholesale", commission_pct: 25 };
const prov = { id: "p2", name: "Prov", billing_mode: "commission", commission_pct: 20 };
const tA = { id: "a", name: "Alpha", partner_id: "p1" };
const tB = { id: "b", name: "Beta", partner_id: "p1" };
const cp = (n: number) => ({ type: "package_unit", code: "charge_point", label: `${n} Ladepunkte`, quantity: n, uvp: 8 * n, ek: 6 * n });

describe("Rechnungsflüsse nach Partnermodell", () => {
  it("ordnet Direktkunde, Wiederverkauf und Provision zu", () => {
    expect(routeTenant({ id: "x", name: "X", partner_id: null }, null)).toBe("direct");
    expect(routeTenant(tA, esb)).toBe("reseller");
    expect(routeTenant({ id: "c", name: "C", partner_id: "p2" }, prov)).toBe("commission");
  });

  it("Sammelrechnung an Wiederverkaufs-Partner zum EK (6 € je Ladepunkt), nach Kunde gegliedert", () => {
    const c = buildCollective([{ tenant: tB, lines: [cp(2)] }, { tenant: tA, lines: [cp(3)] }]);
    expect(c.amount).toBe(30);
    expect(c.lines.map((l) => l.tenant_id)).toEqual(["a", "b"]);
    expect(c.lines[0].label).toBe("Alpha: 3 Ladepunkte");
  });

  it("Einrichtung 200 € im Aktivierungsmonat steht auf der Sammelrechnung", () => {
    const c = buildCollective([{ tenant: tA, lines: [{ type: "setup", code: "setup", label: "Einrichtung", quantity: 1, uvp: 200, ek: 200 }] }]);
    expect(c.amount).toBe(200);
  });

  it("Eigenbedarf des Partners wird „An Partner“ gekennzeichnet", () => {
    const c = buildCollective([{ tenant: { ...tA, partner_self_customer: true }, lines: [cp(1)] }]);
    expect(c.lines[0].to_partner).toBe(true);
    expect(c.lines[0].label).toContain("An Partner");
  });

  it("zu prüfende Mengen werden mit 0 € ausgewiesen", () => {
    const c = buildCollective([{ tenant: tA, lines: [{ ...cp(1), review: true }] }]);
    expect(c.amount).toBe(0);
  });

  it("Provisionsgutschrift = Provisionssatz × UVP je Kunde", () => {
    const c = commissionCredit(prov, [{ tenant: { id: "c", name: "C", partner_id: "p2" }, uvp: 148 }, { tenant: { id: "d", name: "D", partner_id: "p2" }, uvp: 0 }]);
    expect(c.amount).toBe(29.6);
    expect(c.lines).toHaveLength(1);
  });

  it("Endkunden-Entwurf nutzt Partner-Verkaufspreise, sonst UVP", () => {
    const l = partnerCustomerLines([cp(2), { type: "package_unit", code: "extra_location", label: "1 weitere Liegenschaft", quantity: 1, uvp: 39, ek: 29 }], { charge_point: 10 });
    expect(l[0].amount).toBe(20);
    expect(l[1].amount).toBe(39);
  });

  it("vom Partner ergänzte Positionen bleiben bei Neuberechnung erhalten", () => {
    const merged = mergeCustomLines([{ type: "package_unit", label: "x", quantity: 1, unit_price: 8, amount: 8 }], [{ type: "package_unit", amount: 5 }, { type: "custom", label: "Vor-Ort", quantity: 1, unit_price: 90, amount: 90 }]);
    expect(merged.map((m) => m.amount)).toEqual([8, 90]);
  });

  it("warnt bei Direktentwurf an Kunden eines Wiederverkaufs-Partners, nicht bei Eigenbedarf oder Provision", () => {
    const tenants = [tA, { ...tB, partner_self_customer: true }, { id: "c", name: "C", partner_id: "p2" }];
    const drafts = ["a", "b", "c"].map((id) => ({ tenant_id: id, partner_id: null, issued_at: null, status: "draft" }));
    expect(directDraftWarnings(tenants, { p1: esb, p2: prov }, drafts)).toEqual(["Alpha"]);
  });
});
