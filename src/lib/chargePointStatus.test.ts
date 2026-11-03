import { describe, expect, it } from "vitest";
import { normalizeChargePointStatus } from "./chargePointStatus";

describe("reported OCPP connector states", () => {
  it.each([
    ["Available", "available"], ["Preparing", "preparing"], ["Charging", "charging"],
    ["SuspendedEV", "suspended_ev"], ["SuspendedEVSE", "suspended_evse"],
    ["Finishing", "finishing"], ["Reserved", "reserved"],
    ["Unavailable", "unavailable"], ["Faulted", "faulted"], ["Occupied", "occupied"],
  ])("preserves %s as %s", (rawStatus, expected) => {
    expect(normalizeChargePointStatus({ rawStatus, wsConnected: true })).toBe(expected);
    expect(normalizeChargePointStatus({ rawStatus: rawStatus.toLowerCase(), wsConnected: true })).toBe(expected);
  });
  it("does not treat an unknown connected state as offline or charging", () => {
    expect(normalizeChargePointStatus({ rawStatus: "VendorCustomState", wsConnected: true })).toBe("unknown");
  });
  it("overrides a stale charging state when disconnected", () => {
    expect(normalizeChargePointStatus({ rawStatus: "Charging", wsConnected: false })).toBe("offline");
  });
  it("distinguishes a missing configuration from a missing status", () => {
    expect(normalizeChargePointStatus({ hasOcppId: false, wsConnected: true })).toBe("unconfigured");
    expect(normalizeChargePointStatus({ rawStatus: null, wsConnected: true })).toBe("unknown");
  });
});