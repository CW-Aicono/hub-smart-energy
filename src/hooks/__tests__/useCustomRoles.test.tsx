import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

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
    select: vi.fn().mockReturnValue(obj),
    insert: vi.fn().mockReturnValue(obj),
    update: vi.fn().mockReturnValue(obj),
    delete: vi.fn().mockReturnValue(obj),
    eq: vi.fn().mockReturnValue(obj),
    order: vi.fn().mockReturnValue(obj),
    single: vi.fn().mockResolvedValue(resolveValue),
    then(onFulfilled: any, onRejected?: any) {
      return Promise.resolve(resolveValue).then(onFulfilled, onRejected);
    },
  };
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

    const { result } = renderHook(() => useCustomRoles());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual(roles);
    expect(result.current.rolePermissions).toEqual({ "r-1": ["p-1"] });
    expect(result.current.permissionsByCategory.data).toHaveLength(2);
    expect(result.current.permissionsByCategory.system).toHaveLength(1);
  });

  it("prevents deleting system roles", async () => {
    const roles = [{ id: "r-1", name: "Admin", is_system_role: true, tenant_id: "t-1" }];
    setupMocks(roles);

    const { result } = renderHook(() => useCustomRoles());

    await waitFor(() => expect(result.current.loading).toBe(false));
    const res = await result.current.deleteRole("r-1");
    expect(res.error).toBeTruthy();
    expect(res.error.message).toContain("System roles");
  });

  it("exposes CRUD functions", async () => {
    setupMocks();

    const { result } = renderHook(() => useCustomRoles());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.createRole).toBeDefined();
    expect(result.current.updateRole).toBeDefined();
    expect(result.current.togglePermission).toBeDefined();
    expect(result.current.setAllPermissions).toBeDefined();
  });
});
