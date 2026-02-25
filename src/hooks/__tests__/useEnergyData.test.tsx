import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Hoisted mocks with STABLE references ────────────────────────────────────
const { mockSupabase, stableUser } = vi.hoisted(() => {
  return {
    mockSupabase: { from: vi.fn(), auth: {} },
    stableUser: { id: "u-1" },
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("../useAuth", () => ({
  useAuth: () => ({ user: stableUser, session: {}, loading: false }),
}));

const { fakeMeters } = vi.hoisted(() => ({
  fakeMeters: [
    { id: "m-strom", name: "Strom", energy_type: "strom", location_id: "loc-1", capture_type: "manual", is_archived: false, sensor_uuid: null, location_integration_id: null },
    { id: "m-gas", name: "Gas", energy_type: "gas", location_id: "loc-1", capture_type: "manual", is_archived: false, sensor_uuid: null, location_integration_id: null },
  ],
}));
vi.mock("../useMeters", () => ({ useMeters: () => ({ meters: fakeMeters, loading: false }) }));
vi.mock("../useLoxoneSensors", () => ({ useLoxoneSensorsMulti: () => [] }));

import { useEnergyData } from "../useEnergyData";

beforeEach(() => {
  vi.clearAllMocks();
});

function chainMock(data: any[], error: any = null) {
  const resolveValue = { data, error };
  const obj: any = {
    select: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    order: vi.fn(() => obj),
    then(onFulfilled: any, onRejected?: any) {
      return Promise.resolve(resolveValue).then(onFulfilled, onRejected);
    },
  };
  return obj;
}

function setupReadings(readings: any[]) {
  mockSupabase.from.mockImplementation((table: string) => {
    return chainMock(table === "meter_readings" ? readings : []);
  });
}

describe("useEnergyData", () => {
  it("returns empty state when no readings exist", async () => {
    setupReadings([]);
    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useEnergyData());
      hookResult = result;
    });
    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.hasData).toBe(false);
    expect(hookResult.current.energyDistribution).toHaveLength(4);
    expect(hookResult.current.energyDistribution.every((d: any) => d.value === 0)).toBe(true);
  });

  it("aggregates readings by energy type into energyTotals", async () => {
    const now = new Date().toISOString();
    setupReadings([
      { meter_id: "m-strom", value: 100, reading_date: now },
      { meter_id: "m-strom", value: 50, reading_date: now },
      { meter_id: "m-gas", value: 30, reading_date: now },
    ]);
    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useEnergyData());
      hookResult = result;
    });
    expect(hookResult.current.energyTotals.strom).toBe(150);
    expect(hookResult.current.energyTotals.gas).toBe(30);
    expect(hookResult.current.energyTotals.waerme).toBe(0);
    expect(hookResult.current.energyTotals.wasser).toBe(0);
    expect(hookResult.current.hasData).toBe(true);
  });

  it("calculates energy distribution percentages correctly", async () => {
    const now = new Date().toISOString();
    setupReadings([
      { meter_id: "m-strom", value: 75, reading_date: now },
      { meter_id: "m-gas", value: 25, reading_date: now },
    ]);
    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useEnergyData());
      hookResult = result;
    });
    const strom = hookResult.current.energyDistribution.find((d: any) => d.name === "Strom");
    const gas = hookResult.current.energyDistribution.find((d: any) => d.name === "Gas");
    expect(strom?.value).toBe(75);
    expect(gas?.value).toBe(25);
  });

  it("filters readings by locationId when provided", async () => {
    const now = new Date().toISOString();
    setupReadings([{ meter_id: "m-strom", value: 100, reading_date: now }]);
    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useEnergyData("loc-other"));
      hookResult = result;
    });
    expect(hookResult.current.hasData).toBe(false);
    expect(hookResult.current.energyTotals.strom).toBe(0);
  });

  it("returns 12 months of data in monthlyData", async () => {
    setupReadings([]);
    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useEnergyData());
      hookResult = result;
    });
    expect(hookResult.current.monthlyData).toHaveLength(12);
    expect(hookResult.current.monthlyData[0].month).toBe("Jan");
    expect(hookResult.current.monthlyData[11].month).toBe("Dez");
  });
});
