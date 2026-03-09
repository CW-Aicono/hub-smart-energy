import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { ReactNode } from "react";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/i18n/getT", () => ({ getT: () => (k: string) => k }));

import { useChargingTariffs } from "../useChargingTariffs";

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

describe("useChargingTariffs", () => {
  it("fetches tariffs", async () => {
    const tariffs = [{ id: "t-1", name: "Standard", price_per_kwh: 0.35 }];
    mockSupabase.from.mockReturnValue(chainMock(tariffs));

    const { result } = renderHook(() => useChargingTariffs(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tariffs).toEqual(tariffs);
  });

  it("exposes mutation functions", () => {
    mockSupabase.from.mockReturnValue(chainMock([]));
    const { result } = renderHook(() => useChargingTariffs(), { wrapper: createWrapper() });
    expect(result.current.addTariff).toBeDefined();
    expect(result.current.updateTariff).toBeDefined();
    expect(result.current.deleteTariff).toBeDefined();
  });
});
