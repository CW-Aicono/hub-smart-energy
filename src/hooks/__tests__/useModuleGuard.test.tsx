import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React, { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoModeDetector } from "@/contexts/DemoMode";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";

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
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(() => Promise.resolve({ data: null })) })) },
    },
  };
});

function createModuleGuardWrapper(route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <DemoModeDetector>
            <AuthProvider>
              <TenantProvider>{children}</TenantProvider>
            </AuthProvider>
          </DemoModeDetector>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe("useModuleGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows all routes in demo mode", async () => {
    const { useModuleGuard } = await import("@/hooks/useModuleGuard");
    const wrapper = createModuleGuardWrapper("/demo");
    const { result } = renderHook(() => useModuleGuard(), { wrapper });

    expect(result.current.isRouteAllowed("/integrations")).toBe(true);
    expect(result.current.isRouteAllowed("/charging/points")).toBe(true);
    expect(result.current.isRouteAllowed("/automation")).toBe(true);
    expect(result.current.isRouteAllowed("/network")).toBe(true);
    expect(result.current.isRouteAllowed("/arbitrage")).toBe(true);
  });

  it("allows all nav items in demo mode", async () => {
    const { useModuleGuard } = await import("@/hooks/useModuleGuard");
    const wrapper = createModuleGuardWrapper("/demo");
    const { result } = renderHook(() => useModuleGuard(), { wrapper });

    expect(result.current.isNavItemVisible("/integrations")).toBe(true);
    expect(result.current.isNavItemVisible("/charging/points")).toBe(true);
    expect(result.current.isNavItemVisible("/tasks")).toBe(true);
  });

  it("allows routes not mapped to any module", async () => {
    const { useModuleGuard } = await import("@/hooks/useModuleGuard");
    const wrapper = createModuleGuardWrapper("/");
    const { result } = renderHook(() => useModuleGuard(), { wrapper });

    // Unmapped routes should always be allowed
    expect(result.current.isRouteAllowed("/admin")).toBe(true);
    expect(result.current.isRouteAllowed("/settings")).toBe(true);
    expect(result.current.isRouteAllowed("/profile")).toBe(true);
    expect(result.current.isRouteAllowed("/help")).toBe(true);
  });

  it("allows unmapped nav items", async () => {
    const { useModuleGuard } = await import("@/hooks/useModuleGuard");
    const wrapper = createModuleGuardWrapper("/");
    const { result } = renderHook(() => useModuleGuard(), { wrapper });

    expect(result.current.isNavItemVisible("/admin")).toBe(true);
    expect(result.current.isNavItemVisible("/settings")).toBe(true);
  });

  it("isModuleEnabled returns true when no tenant loaded (graceful fallback)", async () => {
    const { useModuleGuard } = await import("@/hooks/useModuleGuard");
    const wrapper = createModuleGuardWrapper("/");
    const { result } = renderHook(() => useModuleGuard(), { wrapper });

    // Without tenant, should default to true (permissive while loading)
    expect(result.current.isModuleEnabled("ev_charging")).toBe(true);
    expect(result.current.isModuleEnabled("automation_multi")).toBe(true);
  });

  it("locationsFullEnabled defaults to true when no tenant", async () => {
    const { useModuleGuard } = await import("@/hooks/useModuleGuard");
    const wrapper = createModuleGuardWrapper("/");
    const { result } = renderHook(() => useModuleGuard(), { wrapper });

    expect(result.current.locationsFullEnabled).toBe(true);
  });
});
