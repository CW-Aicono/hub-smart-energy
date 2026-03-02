import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const { mockSupabase, stableUser } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn(), auth: {} },
  stableUser: { id: "u-1" },
}));
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

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

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
    const { result } = renderHook(() => useEnergyData(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasData).toBe(false);
    expect(result.current.energyDistribution).toHaveLength(4);
    expect(result.current.energyDistribution.every((d: any) => d.value === 0)).toBe(true);
  });

  it("first reading is baseline with zero consumption", async () => {
    setupReadings([
      { meter_id: "m-strom", value: 65000, reading_date: "2026-01-15T00:00:00Z" },
    ]);
    const { result } = renderHook(() => useEnergyData(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.energyTotals.strom).toBe(0);
    expect(result.current.hasData).toBe(false);
  });

  it("calculates delta between two consecutive readings", async () => {
    setupReadings([
      { meter_id: "m-strom", value: 65000, reading_date: "2026-01-15T00:00:00Z" },
      { meter_id: "m-strom", value: 65500, reading_date: "2026-02-15T00:00:00Z" },
      { meter_id: "m-gas", value: 1000, reading_date: "2026-01-15T00:00:00Z" },
      { meter_id: "m-gas", value: 1030, reading_date: "2026-02-15T00:00:00Z" },
    ]);
    const { result } = renderHook(() => useEnergyData(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.energyTotals.strom).toBe(500);
    expect(result.current.energyTotals.gas).toBe(30);
    expect(result.current.hasData).toBe(true);
  });

  it("clamps negative deltas (meter swap) to zero", async () => {
    setupReadings([
      { meter_id: "m-strom", value: 65000, reading_date: "2026-01-15T00:00:00Z" },
      { meter_id: "m-strom", value: 100, reading_date: "2026-02-15T00:00:00Z" },
    ]);
    const { result } = renderHook(() => useEnergyData(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.energyTotals.strom).toBe(0);
  });

  it("filters readings by locationId when provided", async () => {
    setupReadings([
      { meter_id: "m-strom", value: 100, reading_date: "2026-01-01T00:00:00Z" },
      { meter_id: "m-strom", value: 200, reading_date: "2026-02-01T00:00:00Z" },
    ]);
    const { result } = renderHook(() => useEnergyData("loc-other"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasData).toBe(false);
    expect(result.current.energyTotals.strom).toBe(0);
  });

  it("returns 12 months of data in monthlyData", async () => {
    setupReadings([]);
    const { result } = renderHook(() => useEnergyData(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.monthlyData).toHaveLength(12);
    expect(result.current.monthlyData[0].month).toBe("Jan");
    expect(result.current.monthlyData[11].month).toBe("Dez");
  });
});
