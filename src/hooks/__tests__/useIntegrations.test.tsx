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

import { useIntegrations, useLocationIntegrations } from "../useIntegrations";

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

describe("useIntegrations", () => {
  it("fetches integrations and categories on mount", async () => {
    const integrations = [{ id: "i-1", name: "Loxone", is_active: true }];
    const categories = [{ id: "c-1", slug: "building", sort_order: 1 }];
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "integrations") return chainMock(integrations);
      if (table === "integration_categories") return chainMock(categories);
      return chainMock([]);
    });

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useIntegrations());
      hookResult = result;
    });

    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.integrations).toEqual(integrations);
    expect(hookResult.current.categories).toEqual(categories);
  });

  it("handles error in integrations fetch", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "integrations") return chainMock(null, { message: "fail" });
      return chainMock([]);
    });

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useIntegrations());
      hookResult = result;
    });

    expect(hookResult.current.error).toBe("fail");
  });
});

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
