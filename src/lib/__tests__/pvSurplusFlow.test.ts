import { describe, it, expect } from "vitest";
import { computeSurplus, isStorageCoupled } from "../../../supabase/functions/_shared/pvSurplusDecision";
import { computeStorageSetpointKw } from "../../../supabase/functions/_shared/elmiAio";
import { computeKpis, deriveFlows, isStale } from "../pvFlow";

describe("PV-Überschuss ohne Speicher", () => {
  it("nutzt nur den Bezugszähler: 5 kW Einspeisung − 200 W Puffer = 4.800 W", () => {
    const r = computeSurplus({ gridKw: -5, bufferW: 200 });
    expect(r.availableW).toBe(4800);
    expect(r.storageW).toBe(0);
  });
  it("bei Netzbezug gibt es keinen Überschuss", () => {
    expect(computeSurplus({ gridKw: 2, bufferW: 200 }).availableW).toBe(0);
  });
});

describe("ELMI: Speicher gehört zur Ladestation", () => {
  it("ELMI-Vorlage gilt automatisch als gekoppelt, manuelle Einstellung hat Vorrang", () => {
    expect(isStorageCoupled(null, "elmi_aio")).toBe(true);
    expect(isStorageCoupled(null, "generic")).toBe(false);
    expect(isStorageCoupled(false, "elmi_aio")).toBe(false);
  });
  it("Entladeleistung des gekoppelten Speichers zählt nicht als PV-Überschuss", () => {
    const r = computeSurplus({ gridKw: -10, bufferW: 0, storageTargetKw: -6, storageCoupled: true });
    expect(r.availableW).toBe(4000);
  });
  it("beim Laden darf der Speicher immer entladen, auch unter 5 % Ladestand", () => {
    const base = { gridKw: 20, currentSetpointKw: 0, bufferKw: 0, minKw: 5, maxChargeKw: 60, maxDischargeKw: 60, socPct: 3, allowSelfDischarge: true };
    expect(computeStorageSetpointKw(base)).toBe(0);
    expect(computeStorageSetpointKw({ ...base, minSocPct: 0 })).toBe(-20);
  });
});

describe("Analyse-Kennzahlen", () => {
  it("rechnet Netzbezug beim Laden zuerst dem Laden zu", () => {
    const k = computeKpis([
      { t: "a", gridKw: 6, pvKw: 6, evKw: 12, storageKw: null },
      { t: "b", gridKw: -12, pvKw: 12, evKw: 0, storageKw: null },
    ], 60);
    expect(k.evKwh).toBe(12);
    expect(k.gridDuringEvKwh).toBe(6);
    expect(k.pvShareOfEvPct).toBe(50);
    expect(k.exportKwh).toBe(12);
  });
  it("Werte älter als 10 Minuten gelten als veraltet", () => {
    const now = Date.parse("2026-11-03T12:00:00Z");
    expect(isStale("2026-11-03T11:55:00Z", now)).toBe(false);
    expect(isStale("2026-11-03T11:45:00Z", now)).toBe(true);
  });
  it("Gebäudeverbrauch = PV + Netz − Speicher − Laden", () => {
    expect(deriveFlows({ gridKw: 2, pvKw: 10, storageKw: 3, evKw: { a: 4 } }).buildingKw).toBe(5);
  });
});
