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
vi.mock("../useTenantQuery", () => ({
  useTenantQuery: () => ({ tenantId: "t-1", ready: true, from: vi.fn(), insert: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useMeters } from "../useMeters";

beforeEach(() => {
  vi.clearAllMocks();
});

function chainMock(data: any[], error: any = null) {
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

describe("useMeters", () => {
  it("fetches meters on mount and exposes them", async () => {
    const fakeMeter = { id: "m-1", name: "Strom HV", energy_type: "strom", tenant_id: "t-1" };
    mockSupabase.from.mockReturnValue(chainMock([fakeMeter]));

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useMeters());
      hookResult = result;
    });
    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.meters).toEqual([fakeMeter]);
  });

  it("sets meters to empty array on fetch error", async () => {
    mockSupabase.from.mockReturnValue(chainMock(null as any, { message: "fail" }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useMeters());
      hookResult = result;
    });
    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.meters).toEqual([]);
    spy.mockRestore();
  });

  it("returns loading=true initially", () => {
    mockSupabase.from.mockReturnValue(chainMock([]));
    const { result } = renderHook(() => useMeters());
    expect(result.current.loading).toBe(true);
  });
});
