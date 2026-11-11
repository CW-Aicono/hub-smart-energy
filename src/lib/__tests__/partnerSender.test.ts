import { describe, expect, it } from "vitest";
import { mergePartnerSender } from "../partnerSender";
describe("partner billing bank details", () => {
  it("preserves existing bank details when master data is empty", () => {
    expect(mergePartnerSender({ iban: "DE123", bic: "BANKDE", bank_name: "Bank", prefix: "R" }, { iban: "", bic: "", bank_name: "", company_name: "Partner" })).toEqual({ iban: "DE123", bic: "BANKDE", bank_name: "Bank", prefix: "R", company_name: "Partner" });
  });
  it("uses explicitly supplied replacement bank details", () => {
    expect(mergePartnerSender({ iban: "DE123" }, { iban: "DE456" }).iban).toBe("DE456");
  });
});