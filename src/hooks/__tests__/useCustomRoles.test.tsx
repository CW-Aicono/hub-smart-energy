import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("../useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t-1" }, loading: false }),
}));

import { useCustomRoles } from "../useCustomRoles";

function chainMock(data: any, error: any = null) {
  const resolveValue = { data, error };
  const obj: Record<string, any> = {};
  obj.select = vi.fn(() => obj);
  obj.insert = vi.fn(() => obj);
  obj.update = vi.fn(() => obj);
  obj.delete = vi.fn(() => obj);
  obj.eq = vi.fn(() => obj);
  obj.order = vi.fn(() => obj);
  obj.single = vi.fn(() => Promise.resolve(resolveValue));
  obj.then = (onFulfilled: any, onRejected?: any) =>
    Promise.resolve(resolveValue).then(onFulfilled, onRejected);
  return obj;
}

beforeEach(() => vi.clearAllMocks());

describe("useCustomRoles", () => {
  it("starts with loading=true and empty data", () => {
    mockSupabase.from.mockReturnValue(chainMock([]));
    const { result } = renderHook(() => useCustomRoles());

    expect(result.current.loading).toBe(true);
    expect(result.current.roles).toEqual([]);
    expect(result.current.permissions).toEqual([]);
  });

  it("queries all three tables on mount", () => {
    mockSupabase.from.mockReturnValue(chainMock([]));
    renderHook(() => useCustomRoles());

    const calledTables = mockSupabase.from.mock.calls.map((c: any) => c[0]);
    expect(calledTables).toContain("custom_roles");
    expect(calledTables).toContain("permissions");
    expect(calledTables).toContain("custom_role_permissions");
  });

  it("exposes all CRUD functions", () => {
    mockSupabase.from.mockReturnValue(chainMock([]));
    const { result } = renderHook(() => useCustomRoles());

    expect(typeof result.current.createRole).toBe("function");
    expect(typeof result.current.updateRole).toBe("function");
    expect(typeof result.current.deleteRole).toBe("function");
    expect(typeof result.current.togglePermission).toBe("function");
    expect(typeof result.current.setAllPermissions).toBe("function");
    expect(typeof result.current.refetch).toBe("function");
  });

  it("permissionsByCategory groups correctly from initial state", () => {
    mockSupabase.from.mockReturnValue(chainMock([]));
    const { result } = renderHook(() => useCustomRoles());
    // With no permissions loaded, should be empty object
    expect(result.current.permissionsByCategory).toEqual({});
  });
});
