import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFDict, PDFArray } from "pdf-lib";
import { buildZugferdXml, eInvoiceTotals, embedZugferd } from "../zugferd";

const base = {
  number: "AIC-2026-00010", typeCode: "380" as const, issueDate: "2026-11-02", dueDate: "2026-11-16", periodStart: "2026-10-01", periodEnd: "2026-10-31",
  seller: { name: "AICONO GmbH", street: "Weg 1", postalCode: "48565", city: "Steinfurt", vatId: "DE123456789" },
  buyer: { name: "Stadt Steinfurt", postalCode: "48565", city: "Steinfurt" },
  lines: [{ label: "3 Ladepunkte", quantity: 3, unitPrice: 8, amount: 24 }, { label: "Rabatt", quantity: 1, unitPrice: -4, amount: -4 }],
  vatRate: 19, iban: "DE02 1203 0000 0000 2020 51",
};

describe("ZUGFeRD EN 16931", () => {
  it("rechnet Netto, USt und Brutto", () => {
    expect(eInvoiceTotals(base.lines, 19)).toEqual({ net: 20, vat: 3.8, gross: 23.8 });
  });
  it("enthält Profil, Summen, Leitweg-ID und IBAN", () => {
    const x = buildZugferdXml({ ...base, buyerReference: "05515-12345-67" });
    expect(x).toContain("urn:cen.eu:en16931:2017");
    expect(x).toContain("<ram:TypeCode>380</ram:TypeCode>");
    expect(x).toContain("<ram:GrandTotalAmount>23.80</ram:GrandTotalAmount>");
    expect(x).toContain("<ram:BuyerReference>05515-12345-67</ram:BuyerReference>");
    expect(x).toContain("<ram:IBANID>DE02120300000000202051</ram:IBANID>");
  });
  it("weist Abzüge mit negativer Menge und positivem Preis aus", () => {
    const x = buildZugferdXml(base);
    expect(x).toContain('<ram:BilledQuantity unitCode="C62">-1.0000</ram:BilledQuantity>');
    expect(x).not.toContain("<ram:ChargeAmount>-");
  });
  it("Storno-Rechnung: Typ 381 mit positiven Beträgen und Bezug auf das Original", () => {
    const x = buildZugferdXml({ ...base, typeCode: "381", precedingNumber: "AIC-2026-00009", lines: [{ label: "x", quantity: 1, unitPrice: 50, amount: -50 }] });
    expect(x).toContain("<ram:TypeCode>381</ram:TypeCode>");
    expect(x).toContain("<ram:GrandTotalAmount>59.50</ram:GrandTotalAmount>");
    expect(x).toContain("<ram:IssuerAssignedID>AIC-2026-00009</ram:IssuerAssignedID>");
  });
  it("bettet factur-x.xml als Alternative ins PDF ein", async () => {
    const src = await PDFDocument.create(); src.addPage();
    const out = await embedZugferd(await src.save(), buildZugferdXml(base), "Rechnung");
    const pdf = await PDFDocument.load(out);
    const af = pdf.catalog.lookup(PDFName.of("AF"), PDFArray);
    const spec = pdf.context.lookup(af.get(0), PDFDict);
    expect(spec.get(PDFName.of("AFRelationship"))?.toString()).toBe("/Alternative");
    expect(spec.get(PDFName.of("F"))?.toString()).toContain("factur-x.xml");
  });
});
