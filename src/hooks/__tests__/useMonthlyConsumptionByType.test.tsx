import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const { mockSupabase, stableUser, stableTenant } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn(), auth: {} },
  stableUser: { id: "u-1" },
  stableTenant: { id: "tenant-1" },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("../useAuth", () => ({
  useAuth: () => ({ user: stableUser, session: {}, loading: false }),
}));
vi.mock("../useTenant", () => ({
  useTenant: () => ({ tenant: stableTenant, loading: false }),
}));

import { useMonthlyConsumptionByType } from "../useMonthlyConsumptionByType";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function createQueryMock(resolver: (table: string, state: Record<string, any>) => any[]) {
  return (table: string) => {
    const state: Record<string, any> = { table, filters: {} };
    const obj: any = {
      select: vi.fn(() => obj),
      eq: vi.fn((column: string, value: any) => {
        state.filters[column] = value;
        return obj;
      }),
      gte: vi.fn((column: string, value: any) => {
        state.filters[`gte:${column}`] = value;
        return obj;
      }),
      lte: vi.fn((column: string, value: any) => {
        state.filters[`lte:${column}`] = value;
        return obj;
      }),
      order: vi.fn(() => obj),
      then(onFulfilled: any, onRejected?: any) {
        return Promise.resolve({ data: resolver(table, state), error: null }).then(onFulfilled, onRejected);
      },
    };
    return obj;
  };
}

describe("useMonthlyConsumptionByType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fills missing monthly totals from daily rows for past months and current month", async () => {
    mockSupabase.from.mockImplementation(
      createQueryMock((table, state) => {
        if (table === "meters") {
          return [
            { id: "m-main", location_id: "loc-1", unit: "kWh", gas_type: null, brennwert: null, zustandszahl: null },
          ];
        }

        if (table === "meter_period_totals" && state.filters.period_type === "month") {
          return [];
        }

        if (table === "meter_period_totals" && state.filters.period_type === "day") {
          expect(state.filters["gte:period_start"]).toBe("2026-01-01");
          expect(state.filters["lte:period_start"]).toBe("2026-04-30");

          return [
            { meter_id: "m-main", period_start: "2026-02-16", total_value: 100 },
            { meter_id: "m-main", period_start: "2026-02-17", total_value: 150 },
            { meter_id: "m-main", period_start: "2026-03-01", total_value: 200 },
            { meter_id: "m-main", period_start: "2026-04-01", total_value: 300 },
            { meter_id: "m-main", period_start: "2026-04-02", total_value: 400 },
          ];
        }

        return [];
      }),
    );

    const { result } = renderHook(
      () => useMonthlyConsumptionByType({ locationId: "loc-1", energyType: "strom", year: 2026 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toHaveLength(12);
    expect(result.current.data?.[1].value).toBe(250000);
    expect(result.current.data?.[2].value).toBe(200000);
    expect(result.current.data?.[3].value).toBe(700000);
  });
});