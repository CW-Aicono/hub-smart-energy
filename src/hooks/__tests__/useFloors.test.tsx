import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn(), auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) }, storage: { from: vi.fn(() => ({ getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://test.com/file.png" } })) })) } },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import { useFloors } from "../useFloors";

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

describe("useFloors", () => {
  it("fetches floors for a location", async () => {
    const floors = [{ id: "f-1", name: "EG", floor_number: 0 }];
    mockSupabase.from.mockReturnValue(chainMock(floors));

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useFloors("loc-1"));
      hookResult = result;
    });

    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.floors).toEqual(floors);
  });

  it("returns empty when no locationId", async () => {
    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useFloors(undefined));
      hookResult = result;
    });

    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.floors).toEqual([]);
  });

  it("handles fetch error", async () => {
    mockSupabase.from.mockReturnValue(chainMock(null, { message: "DB error" }));

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useFloors("loc-1"));
      hookResult = result;
    });

    expect(hookResult.current.error).toBe("DB error");
  });
});
