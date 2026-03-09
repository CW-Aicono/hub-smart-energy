import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("../useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t-1" }, loading: false }),
}));
vi.mock("../useTenantQuery", () => ({
  useTenantQuery: () => ({ tenantId: "t-1", ready: true, from: vi.fn(), insert: vi.fn().mockResolvedValue({ error: null }) }),
}));
vi.mock("@/lib/gatewayRegistry", () => ({ getEdgeFunctionName: () => "loxone-api" }));
vi.mock("@/i18n/getT", () => ({ getT: () => (k: string) => k }));

import { useLocationIntegrations } from "../useIntegrations";

function chainMock(data: any, error: any = null) {
  const resolveValue = { data, error };
  const obj: any = {
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    update: vi.fn(() => obj),
    delete: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    order: vi.fn(() => obj),
    single: vi.fn(() => Promise.resolve(resolveValue)),
    then(onFulfilled: any, onRejected?: any) {
      return Promise.resolve(resolveValue).then(onFulfilled, onRejected);
    },
  };
  return obj;
}

beforeEach(() => vi.clearAllMocks());

describe("useLocationIntegrations", () => {
  it("fetches location integrations for given locationId", async () => {
    const locInts = [{ id: "li-1", integration_id: "i-1", is_enabled: true }];
    mockSupabase.from.mockReturnValue(chainMock(locInts));

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useLocationIntegrations("loc-1"));
      hookResult = result;
    });

    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.locationIntegrations).toEqual(locInts);
  });

  it("returns empty when no locationId", async () => {
    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useLocationIntegrations(undefined));
      hookResult = result;
    });

    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.locationIntegrations).toEqual([]);
  });

  it("testConnection returns error when config is empty", async () => {
    mockSupabase.from.mockReturnValue(chainMock([]));
    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useLocationIntegrations("loc-1"));
      hookResult = result;
    });

    const res = await hookResult.current.testConnection({});
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("testConnection returns success when config has values", async () => {
    mockSupabase.from.mockReturnValue(chainMock([]));
    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useLocationIntegrations("loc-1"));
      hookResult = result;
    });

    const res = await hookResult.current.testConnection({ serial: "12345" });
    expect(res.success).toBe(true);
  });
});
