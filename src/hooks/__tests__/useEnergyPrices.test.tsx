import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { mockSupabase, stableUser } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() },
  stableUser: { id: "u-1" },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("../useAuth", () => ({
  useAuth: () => ({ user: stableUser, session: {}, loading: false }),
}));
vi.mock("../useTenantQuery", () => ({
  useTenantQuery: () => ({ tenantId: "t-1", ready: true, from: vi.fn(), insert: vi.fn().mockResolvedValue({ error: null }) }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/i18n/getT", () => ({ getT: () => (k: string) => k }));

import { useEnergyPrices } from "../useEnergyPrices";

function chainMock(data: any, error: any = null) {
  const resolveValue = { data, error };
  const obj: any = {
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    update: vi.fn(() => obj),
    delete: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    order: vi.fn(() => obj),
    then(onFulfilled: any, onRejected?: any) {
      return Promise.resolve(resolveValue).then(onFulfilled, onRejected);
    },
  };
  return obj;
}

beforeEach(() => vi.clearAllMocks());

describe("useEnergyPrices", () => {
  it("fetches prices on mount", async () => {
    const prices = [
      { id: "ep-1", location_id: "loc-1", energy_type: "strom", price_per_unit: 0.30, valid_from: "2024-01-01", valid_until: null },
    ];
    mockSupabase.from.mockReturnValue(chainMock(prices));

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useEnergyPrices());
      hookResult = result;
    });

    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.prices).toEqual(prices);
  });

  it("filters by locationId when provided", async () => {
    const chain = chainMock([]);
    mockSupabase.from.mockReturnValue(chain);

    await act(async () => {
      renderHook(() => useEnergyPrices("loc-1"));
    });

    expect(chain.eq).toHaveBeenCalledWith("location_id", "loc-1");
  });

  it("getActivePrice returns 0 when no matching price", async () => {
    mockSupabase.from.mockReturnValue(chainMock([]));

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useEnergyPrices());
      hookResult = result;
    });

    expect(hookResult.current.getActivePrice("loc-1", "strom")).toBe(0);
  });

  it("getActivePrice returns matching price", async () => {
    const today = new Date().toISOString().split("T")[0];
    const prices = [
      { id: "ep-1", location_id: "loc-1", energy_type: "strom", price_per_unit: 0.30, valid_from: "2020-01-01", valid_until: null },
    ];
    mockSupabase.from.mockReturnValue(chainMock(prices));

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useEnergyPrices());
      hookResult = result;
    });

    expect(hookResult.current.getActivePrice("loc-1", "strom")).toBe(0.30);
  });
});
