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

function setupMocks(roles: any[] = [], permissions: any[] = [], rolePerms: any[] = []) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "custom_roles") return chainMock(roles);
    if (table === "permissions") return chainMock(permissions);
    if (table === "custom_role_permissions") return chainMock(rolePerms);
    return chainMock([]);
  });
}

describe("useCustomRoles", () => {
  it("fetches roles and groups permissions by category", async () => {
    const roles = [{ id: "r-1", name: "Admin", is_system_role: true, tenant_id: "t-1" }];
    const permissions = [
      { id: "p-1", code: "read", name: "Read", category: "data" },
      { id: "p-2", code: "write", name: "Write", category: "data" },
      { id: "p-3", code: "admin", name: "Admin", category: "system" },
    ];
    const rolePerms = [{ custom_role_id: "r-1", permission_id: "p-1" }];
    setupMocks(roles, permissions, rolePerms);

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useCustomRoles());
      hookResult = result;
      // Wait for the useEffect + Promise.all to resolve
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(hookResult.current.loading).toBe(false);
    expect(hookResult.current.roles).toEqual(roles);
    expect(hookResult.current.rolePermissions).toEqual({ "r-1": ["p-1"] });
    expect(hookResult.current.permissionsByCategory.data).toHaveLength(2);
    expect(hookResult.current.permissionsByCategory.system).toHaveLength(1);
  });

  it("prevents deleting system roles", async () => {
    const roles = [{ id: "r-1", name: "Admin", is_system_role: true, tenant_id: "t-1" }];
    setupMocks(roles);

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useCustomRoles());
      hookResult = result;
      await new Promise((r) => setTimeout(r, 50));
    });

    const res = await hookResult.current.deleteRole("r-1");
    expect(res.error).toBeTruthy();
    expect(res.error.message).toContain("System roles");
  });

  it("exposes CRUD functions", async () => {
    setupMocks();

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() => useCustomRoles());
      hookResult = result;
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(hookResult.current.createRole).toBeDefined();
    expect(hookResult.current.updateRole).toBeDefined();
    expect(hookResult.current.togglePermission).toBeDefined();
    expect(hookResult.current.setAllPermissions).toBeDefined();
  });
});
