import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { ReactNode } from "react";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("../useTenant", () => ({
  useTenant: () => ({ tenant: { id: "demo-tenant-id" }, loading: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { usePvForecast, usePvForecastSettings } from "../usePvForecast";

function chainMock(data: any, error: any = null) {
  const resolveValue = { data, error };
  const obj: any = {
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    update: vi.fn(() => obj),
    upsert: vi.fn(() => obj),
    delete: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    order: vi.fn(() => obj),
    maybeSingle: vi.fn(() => Promise.resolve(resolveValue)),
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

describe("usePvForecast", () => {
  it("returns demo forecast for demo tenant", async () => {
    const { result } = renderHook(() => usePvForecast("demo-loc-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.forecast).toBeTruthy();
    expect(result.current.forecast!.location.name).toContain("Hauptverwaltung");
    expect(result.current.forecast!.hourly.length).toBe(24);
  });

  it("returns demo forecast for all locations when null", async () => {
    const { result } = renderHook(() => usePvForecast(null), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.forecast).toBeTruthy();
    expect(result.current.forecast!.location.name).toContain("Alle Anlagen");
  });
});

describe("usePvForecastSettings", () => {
  it("fetches settings for a location", async () => {
    // Override tenant to non-demo
    vi.doMock("../useTenant", () => ({
      useTenant: () => ({ tenant: { id: "t-1" }, loading: false }),
    }));

    const settings = { id: "s-1", peak_power_kwp: 10, tilt_deg: 30, azimuth_deg: 180, is_active: true };
    mockSupabase.from.mockReturnValue(chainMock(settings));

    const { result } = renderHook(() => usePvForecastSettings("loc-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.upsertSettings).toBeDefined();
    expect(result.current.deleteSettings).toBeDefined();
  });
});
