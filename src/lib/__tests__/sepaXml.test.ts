import { describe, it, expect } from "vitest";
import { generateSepaDirectDebitXml } from "../sepaXml";

const baseOpts = {
  msgId: "MSG-001",
  creditorName: "Test GmbH",
  creditorIban: "DE89370400440532013000",
  creditorBic: "COBADEFFXXX",
  creditorId: "DE98ZZZ09999999999",
  collectionDate: "2024-03-15",
  payments: [
    {
      endToEndId: "E2E-001",
      amount: 100.50,
      mandateRef: "MAND-001",
      mandateDate: "2023-01-15",
      debtorName: "Max Mustermann",
      debtorIban: "DE27100777770209299700",
      debtorBic: "DEUTDEDBBER",
      remittanceInfo: "Rechnung 2024-001",
    },
  ],
};

describe("generateSepaDirectDebitXml", () => {
  it("generates valid XML structure", () => {
    const xml = generateSepaDirectDebitXml(baseOpts);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("pain.008.001.02");
    expect(xml).toContain("<CstmrDrctDbtInitn>");
  });

  it("contains creditor information", () => {
    const xml = generateSepaDirectDebitXml(baseOpts);
    expect(xml).toContain("Test GmbH");
    expect(xml).toContain("DE89370400440532013000");
    expect(xml).toContain("COBADEFFXXX");
    expect(xml).toContain("DE98ZZZ09999999999");
  });

  it("contains payment details", () => {
    const xml = generateSepaDirectDebitXml(baseOpts);
    expect(xml).toContain("E2E-001");
    expect(xml).toContain("100.50");
    expect(xml).toContain("Max Mustermann");
    expect(xml).toContain("Rechnung 2024-001");
  });

  it("calculates correct control sum", () => {
    const xml = generateSepaDirectDebitXml(baseOpts);
    expect(xml).toContain("<CtrlSum>100.50</CtrlSum>");
  });

  it("handles multiple payments", () => {
    const opts = {
      ...baseOpts,
      payments: [
        { ...baseOpts.payments[0], amount: 50, endToEndId: "E2E-A" },
        { ...baseOpts.payments[0], amount: 75, endToEndId: "E2E-B" },
      ],
    };
    const xml = generateSepaDirectDebitXml(opts);
    expect(xml).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(xml).toContain("<CtrlSum>125.00</CtrlSum>");
  });

  it("escapes XML special characters", () => {
    const opts = {
      ...baseOpts,
      creditorName: "Test & Partner <GmbH>",
    };
    const xml = generateSepaDirectDebitXml(opts);
    expect(xml).toContain("Test &amp; Partner &lt;GmbH&gt;");
    expect(xml).not.toContain("Test & Partner <GmbH>");
  });

  it("uses NOTPROVIDED when debtorBic is missing", () => {
    const opts = {
      ...baseOpts,
      payments: [{ ...baseOpts.payments[0], debtorBic: undefined }],
    };
    const xml = generateSepaDirectDebitXml(opts);
    expect(xml).toContain("NOTPROVIDED");
  });

  it("strips spaces from IBANs", () => {
    const opts = {
      ...baseOpts,
      creditorIban: "DE89 3704 0044 0532 0130 00",
      payments: [{ ...baseOpts.payments[0], debtorIban: "DE27 1007 7777 0209 2997 00" }],
    };
    const xml = generateSepaDirectDebitXml(opts);
    expect(xml).toContain("DE89370400440532013000");
    expect(xml).toContain("DE27100777770209299700");
  });
});
