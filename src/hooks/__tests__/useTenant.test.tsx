import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createTestWrapper, createDemoWrapper } from "@/test/helpers";

// Mock supabase before importing the hook
vi.mock("@/integrations/supabase/client", () => {
  const chainable = (terminal: Record<string, unknown> = {}) => {
    const obj: Record<string, any> = {};
    const methods = ["select", "eq", "neq", "in", "is", "order", "limit", "gte", "lte", "range", "filter", "match"];
    methods.forEach((m) => { obj[m] = vi.fn(() => obj); });
    obj.single = vi.fn(() => Promise.resolve(terminal));
    obj.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    // Allow direct then (for non-single queries)
    obj.then = (resolve: any) => Promise.resolve(terminal).then(resolve);
    return obj;
  };

  return {
    supabase: {
      from: vi.fn(() => chainable({ data: null, error: null })),
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(() => Promise.resolve({ data: null })) })) },
    },
  };
});

describe("useTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides demo tenant data when in demo mode", async () => {
    const { useTenant } = await import("@/hooks/useTenant");
    const wrapper = createDemoWrapper();
    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tenant).not.toBeNull();
    expect(result.current.tenant?.id).toBe("demo-tenant-id");
    expect(result.current.tenant?.name).toBe("Stadtwerke Musterstadt GmbH");
    expect(result.current.tenant?.slug).toBe("demo");
  });

  it("provides default branding values in demo mode", async () => {
    const { useTenant } = await import("@/hooks/useTenant");
    const wrapper = createDemoWrapper();
    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const branding = result.current.tenant?.branding;
    expect(branding).toBeDefined();
    expect(branding?.primary_color).toBe("#1a365d");
    expect(branding?.font_family).toBe("Inter");
  });

  it("sets tenant to null when no user is logged in", async () => {
    const { useTenant } = await import("@/hooks/useTenant");
    const wrapper = createTestWrapper("/");
    const { result } = renderHook(() => useTenant(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tenant).toBeNull();
  });

  it("throws when used outside TenantProvider", async () => {
    const { useTenant } = await import("@/hooks/useTenant");
    expect(() => {
      renderHook(() => useTenant());
    }).toThrow("useTenant must be used within TenantProvider");
  });
});
