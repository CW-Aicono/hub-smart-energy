import { describe, it, expect } from "vitest";
import {
  parseOcmf,
  buildUnsignedOcmf,
  publicKeyFingerprint,
  ocmfFilename,
  safeTransparenzUrl,
  buildOcmf,
} from "../ocmf";

describe("OCMF parser", () => {
  const SAMPLE =
    'OCMF|{"FV":"1.0","GI":"ABL eMH3","GS":"190100001","GV":"1.0","PG":"T1234","MV":"ABL","MM":"eMH3","MS":"190100001","IS":true,"IL":"VERIFIED","IF":["RFID_RELATED"],"IT":"ISO14443","ID":"04A1B2C3","RD":[{"TM":"2025-06-07T12:00:00,000+0200 R","TX":"B","RV":12345.6,"RI":"1-0:1.8.0","RU":"kWh","RT":"AC","EF":"","ST":"G"},{"TM":"2025-06-07T13:00:00,000+0200 R","TX":"E","RV":12350.2,"RI":"1-0:1.8.0","RU":"kWh","RT":"AC","EF":"","ST":"G"}]}|{"SA":"ECDSA-secp256r1-SHA256","SD":"304402201a2b3c"}';

  it("parses a complete OCMF frame", () => {
    const r = parseOcmf(SAMPLE);
    expect(r.ok).toBe(true);
    expect(r.header?.GI).toBe("ABL eMH3");
    expect(r.header?.RD).toHaveLength(2);
    expect(r.header?.RD?.[0].TX).toBe("B");
    expect(r.header?.RD?.[1].RV).toBe(12350.2);
    expect(r.signature?.SA).toContain("ECDSA");
    expect(r.signature?.SD).toBeTruthy();
  });

  it("parses unsigned OCMF (no signature block)", () => {
    const stub = 'OCMF|{"FV":"1.0","GI":"x","RD":[]}|';
    const r = parseOcmf(stub);
    expect(r.ok).toBe(true);
    expect(r.signature).toBeUndefined();
  });

  it("rejects garbage", () => {
    expect(parseOcmf("hello world").ok).toBe(false);
    expect(parseOcmf("").ok).toBe(false);
    expect(parseOcmf("OCMF|not-json|").ok).toBe(false);
  });

  it("decodes ALFEN base64-wrapped OCMF", () => {
    const inner = 'OCMF|{"FV":"1.0","GI":"Alfen Eve","RD":[]}|';
    const b64 = btoa(inner);
    const r = parseOcmf(b64);
    expect(r.ok).toBe(true);
    expect(r.header?.GI).toBe("Alfen Eve");
  });
});

describe("OCMF builder", () => {
  it("builds a parseable unsigned stub", () => {
    const stub = buildUnsignedOcmf({
      transactionId: "42",
      startTs: "2025-06-07T10:00:00Z",
      stopTs: "2025-06-07T11:00:00Z",
      startWh: 1_000_000,
      stopWh: 1_005_500,
      identifier: "04AABBCC",
      identifierType: "ISO14443",
      meterSerial: "TEST123",
      vendor: "AICONO",
      model: "SoftMeter",
    });
    const parsed = parseOcmf(stub);
    expect(parsed.ok).toBe(true);
    expect(parsed.header?.PG).toBe("T42");
    expect(parsed.header?.RD?.[0].RV).toBe(1000);
    expect(parsed.header?.RD?.[1].RV).toBe(1005.5);
    expect(parsed.header?.IL).toBe("NONE");
  });

  it("roundtrips header + signature", () => {
    const built = buildOcmf({ FV: "1.0", GI: "x" }, { SA: "ECDSA-secp256r1-SHA256", SD: "deadbeef" });
    const parsed = parseOcmf(built);
    expect(parsed.signature?.SD).toBe("deadbeef");
  });
});

describe("OCMF utilities", () => {
  it("calculates a colon-separated SHA-256 fingerprint", async () => {
    const fp = await publicKeyFingerprint(
      "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----",
    );
    expect(fp).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/);
  });

  it("creates an .ocmf filename", () => {
    expect(ocmfFilename("abcd1234-aaaa-bbbb-cccc-dddddddddddd", 99)).toBe("eichrecht-session-99.ocmf");
    expect(ocmfFilename("abcd1234-aaaa-bbbb-cccc-dddddddddddd", null)).toBe("eichrecht-session-abcd1234.ocmf");
  });

  it("builds a S.A.F.E. transparenz URL with url-encoded OCMF", () => {
    const url = safeTransparenzUrl("OCMF|{}|");
    expect(url).toContain("safe-ev.de");
    expect(url).toContain(encodeURIComponent("OCMF|{}|"));
  });
});
