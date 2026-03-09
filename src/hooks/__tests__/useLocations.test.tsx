import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { ReactNode } from "react";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("../useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t-1", name: "Test" }, loading: false }),
}));
vi.mock("../useTenantQuery", () => ({
  useTenantQuery: () => ({ tenantId: "t-1", ready: true, from: vi.fn(), insert: vi.fn().mockResolvedValue({ error: null }) }),
}));
vi.mock("@/contexts/DemoMode", () => ({
  useDemoMode: () => false,
}));

import { useLocations } from "../useLocations";

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

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => vi.clearAllMocks());

describe("useLocations", () => {
  it("fetches locations and builds hierarchy", async () => {
    const locs = [
      { id: "l-1", tenant_id: "t-1", parent_id: null, name: "HQ", type: "einzelgebaeude" },
      { id: "l-2", tenant_id: "t-1", parent_id: "l-1", name: "Wing A", type: "einzelgebaeude" },
    ];
    mockSupabase.from.mockReturnValue(chainMock(locs));

    const { result } = renderHook(() => useLocations(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locations).toHaveLength(2);
    expect(result.current.hierarchicalLocations).toHaveLength(1);
    expect(result.current.hierarchicalLocations[0].children).toHaveLength(1);
  });

  it("returns empty on error", async () => {
    mockSupabase.from.mockReturnValue(chainMock(null, { message: "fail" }));

    const { result } = renderHook(() => useLocations(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});
