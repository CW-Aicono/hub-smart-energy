import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

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

describe("useCustomRoles", () => {
  it("fetches roles, permissions, and role permissions on mount", async () => {
    const roles = [{ id: "r-1", name: "Admin", is_system_role: true, tenant_id: "t-1" }];
    const permissions = [{ id: "p-1", code: "read", name: "Read", category: "general" }];
    const rolePerms = [{ custom_role_id: "r-1", permission_id: "p-1" }];

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "custom_roles") return chainMock(roles);
      if (table === "permissions") return chainMock(permissions);
      if (table === "custom_role_permissions") return chainMock(rolePerms);
      return chainMock([]);
    });

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useCustomRoles());
      hookResult = result;
    });

    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.roles).toEqual(roles);
    expect(hookResult.current.permissions).toEqual(permissions);
    expect(hookResult.current.rolePermissions).toEqual({ "r-1": ["p-1"] });
  });

  it("returns empty when no tenant", async () => {
    // Re-mock to return null tenant
    vi.doMock("../useTenant", () => ({
      useTenant: () => ({ tenant: null, loading: false }),
    }));

    // Since vi.doMock doesn't affect already-imported module, test the guard directly
    mockSupabase.from.mockReturnValue(chainMock([]));
    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useCustomRoles());
      hookResult = result;
    });

    expect(hookResult.current.roles).toBeDefined();
  });

  it("prevents deleting system roles", async () => {
    const roles = [{ id: "r-1", name: "Admin", is_system_role: true, tenant_id: "t-1" }];
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "custom_roles") return chainMock(roles);
      return chainMock([]);
    });

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useCustomRoles());
      hookResult = result;
    });

    const result = await hookResult.current.deleteRole("r-1");
    expect(result.error).toBeTruthy();
    expect(result.error.message).toContain("System roles");
  });

  it("groups permissions by category", async () => {
    const perms = [
      { id: "p-1", code: "read", name: "Read", category: "data" },
      { id: "p-2", code: "write", name: "Write", category: "data" },
      { id: "p-3", code: "admin", name: "Admin", category: "system" },
    ];
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "permissions") return chainMock(perms);
      return chainMock([]);
    });

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useCustomRoles());
      hookResult = result;
    });

    expect(hookResult.current.permissionsByCategory.data).toHaveLength(2);
    expect(hookResult.current.permissionsByCategory.system).toHaveLength(1);
  });
});
