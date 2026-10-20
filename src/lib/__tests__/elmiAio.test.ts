import { describe, it, expect } from "vitest";
import {
  decodeRegisters32,
  encodeSetpointW,
  computeStorageSetpointKw,
} from "../../../supabase/functions/_shared/elmiAio";

const base = {
  gridKw: 0,
  currentSetpointKw: 0,
  bufferKw: 0,
  minKw: 5,
  maxChargeKw: 60,
  maxDischargeKw: 60,
  socPct: 50,
  allowSelfDischarge: false,
};

describe("ELMI AiO Register", () => {
  it("liest 1070 = 0x0001 0x85D8 als 9.980 W (Herstellerbeispiel)", () => {
    expect(decodeRegisters32(0x0001, 0x85d8, false)).toBe(9980);
  });
  it("schreibt 10 kW Laden als 0x0001 0x86A0", () => {
    expect(encodeSetpointW(10000)).toEqual([0x0001, 0x86a0]);
  });
  it("schreibt 10 kW Entladen als Zweierkomplement 0xFFFE 0x7960", () => {
    expect(encodeSetpointW(-10000)).toEqual([0xfffe, 0x7960]);
    expect(decodeRegisters32(0xfffe, 0x7960, true)).toBe(-10000);
  });
});

describe("ELMI AiO Sollwert", () => {
  it("unter 5 kW Überschuss wird nicht geladen", () => {
    expect(computeStorageSetpointKw({ ...base, gridKw: -4.9 })).toBe(0);
  });
  it("ab 5 kW Überschuss wird der Überschuss geladen", () => {
    expect(computeStorageSetpointKw({ ...base, gridKw: -12 })).toBe(12);
  });
  it("Ladeleistung wird auf Register 1074 begrenzt", () => {
    expect(computeStorageSetpointKw({ ...base, gridKw: -100, maxChargeKw: 60 })).toBe(60);
  });
  it("berücksichtigt den bereits laufenden Sollwert", () => {
    expect(computeStorageSetpointKw({ ...base, gridKw: -2, currentSetpointKw: 10 })).toBe(12);
  });
  it("voller Speicher lädt nicht", () => {
    expect(computeStorageSetpointKw({ ...base, gridKw: -20, socPct: 100 })).toBe(0);
  });
  it("ohne Freigabe wird bei Netzbezug nie entladen", () => {
    expect(computeStorageSetpointKw({ ...base, gridKw: 30 })).toBe(0);
  });
  it("Eigenverbrauchs-Entladung speist nie ins Netz ein", () => {
    const sp = computeStorageSetpointKw({ ...base, gridKw: 8, allowSelfDischarge: true, maxDischargeKw: 60 });
    expect(sp).toBe(-8);
    expect(8 + sp).toBeGreaterThanOrEqual(0);
  });
});
