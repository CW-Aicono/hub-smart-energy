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
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/i18n/getT", () => ({ getT: () => (k: string) => k }));

import { useAlertRules } from "../useAlertRules";

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

describe("useAlertRules", () => {
  it("fetches alert rules on mount", async () => {
    const rules = [{ id: "ar-1", name: "High usage", threshold_value: 100, is_active: true }];
    mockSupabase.from.mockReturnValue(chainMock(rules));

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useAlertRules());
      hookResult = result;
    });

    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.alertRules).toEqual(rules);
  });

  it("filters by locationId when provided", async () => {
    const chain = chainMock([]);
    mockSupabase.from.mockReturnValue(chain);

    await act(async () => {
      renderHook(() => useAlertRules("loc-1"));
    });

    expect(chain.eq).toHaveBeenCalledWith("location_id", "loc-1");
  });

  it("handles fetch error gracefully", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSupabase.from.mockReturnValue(chainMock(null, { message: "fail" }));

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useAlertRules());
      hookResult = result;
    });

    expect(hookResult.current.alertRules).toEqual([]);
    spy.mockRestore();
  });
});
