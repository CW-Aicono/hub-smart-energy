import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ── Hoisted mocks ───────────────────────────────────────────────────────────
const { mockSupabase, mockQueryBuilder } = vi.hoisted(() => {
  const qb: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    mockSupabase: { from: vi.fn().mockReturnValue(qb) },
    mockQueryBuilder: qb,
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

const { mockTenantValue } = vi.hoisted(() => ({
  mockTenantValue: { tenant: null as any, loading: true, error: null, refetch: vi.fn(), updateBranding: vi.fn().mockResolvedValue({ error: null }) },
}));
vi.mock("../useTenant", () => ({ useTenant: () => mockTenantValue }));

import { useTenantQuery } from "../useTenantQuery";

beforeEach(() => {
  vi.clearAllMocks();
  mockTenantValue.tenant = null;
  mockTenantValue.loading = true;
});

describe("useTenantQuery", () => {
  it("is not ready when tenant is null", () => {
    const { result } = renderHook(() => useTenantQuery());
    expect(result.current.ready).toBe(false);
    expect(result.current.tenantId).toBeNull();
  });

  it("is ready and exposes tenantId when tenant is loaded", () => {
    mockTenantValue.tenant = { id: "t-123" };
    mockTenantValue.loading = false;
    const { result } = renderHook(() => useTenantQuery());
    expect(result.current.ready).toBe(true);
    expect(result.current.tenantId).toBe("t-123");
  });

  it("from() applies tenant_id filter via eq", () => {
    mockTenantValue.tenant = { id: "t-abc" };
    mockTenantValue.loading = false;
    const { result } = renderHook(() => useTenantQuery());
    result.current.from("meters" as any);
    expect(mockSupabase.from).toHaveBeenCalledWith("meters");
    expect(mockQueryBuilder.select).toHaveBeenCalledWith("*");
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith("tenant_id", "t-abc");
  });

  it("insert() injects tenant_id into data", async () => {
    mockTenantValue.tenant = { id: "t-xyz" };
    mockTenantValue.loading = false;
    const { result } = renderHook(() => useTenantQuery());
    await result.current.insert("meters" as any, { name: "Test" } as any);
    expect(mockQueryBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Test", tenant_id: "t-xyz" }));
  });

  it("insert() returns error when tenant not loaded", async () => {
    const { result } = renderHook(() => useTenantQuery());
    const res = await result.current.insert("meters" as any, { name: "X" } as any);
    expect(res.error).toBeTruthy();
    expect(res.data).toBeNull();
  });
});
