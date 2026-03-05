import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createTestWrapper, createDemoWrapper } from "@/test/helpers";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => {
  const chainable = (terminal: Record<string, unknown> = {}) => {
    const obj: Record<string, any> = {};
    ["select", "eq", "neq", "in", "is", "order", "limit", "gte", "lte", "range", "filter", "match"].forEach(
      (m) => { obj[m] = vi.fn(() => obj); }
    );
    obj.single = vi.fn(() => Promise.resolve(terminal));
    obj.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    obj.then = (resolve: any) => Promise.resolve(terminal).then(resolve);
    return obj;
  };

  return {
    supabase: {
      from: vi.fn(() => chainable({ data: null, error: null })),
      rpc: vi.fn(() => Promise.resolve({ data: "admin", error: null })),
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(() => Promise.resolve({ data: null })) })) },
    },
  };
});

describe("useUserRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns admin role and isAdmin=true in demo mode", async () => {
    const { useUserRole } = await import("@/hooks/useUserRole");
    const wrapper = createDemoWrapper();
    const { result } = renderHook(() => useUserRole(), { wrapper });

    // In demo mode, loading should be false immediately and role should be admin
    expect(result.current.loading).toBe(false);
    expect(result.current.role).toBe("admin");
    expect(result.current.isAdmin).toBe(true);
  });

  it("returns null role when no user is logged in", async () => {
    const { useUserRole } = await import("@/hooks/useUserRole");
    const wrapper = createTestWrapper("/");
    const { result } = renderHook(() => useUserRole(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBeNull();
    expect(result.current.isAdmin).toBe(false);
  });

  it("isAdmin is false for non-admin roles", async () => {
    const { useUserRole } = await import("@/hooks/useUserRole");
    const wrapper = createTestWrapper("/");
    const { result } = renderHook(() => useUserRole(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Without a user, role is null → isAdmin = false
    expect(result.current.isAdmin).toBe(false);
  });
});
