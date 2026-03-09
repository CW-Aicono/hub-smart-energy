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

import { useChargingSessions } from "../useChargingSessions";

function chainMock(data: any, error: any = null) {
  const resolveValue = { data, error };
  const obj: any = {
    select: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    order: vi.fn(() => obj),
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

describe("useChargingSessions", () => {
  it("fetches all sessions when no chargePointId", async () => {
    const sessions = [{ id: "s-1", energy_kwh: 12.5, status: "completed" }];
    mockSupabase.from.mockReturnValue(chainMock(sessions));

    const { result } = renderHook(() => useChargingSessions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessions).toEqual(sessions);
  });

  it("filters by chargePointId when provided", async () => {
    const chain = chainMock([]);
    mockSupabase.from.mockReturnValue(chain);

    renderHook(() => useChargingSessions("cp-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(chain.eq).toHaveBeenCalledWith("charge_point_id", "cp-1"));
  });

  it("sets up realtime subscription", () => {
    mockSupabase.from.mockReturnValue(chainMock([]));
    renderHook(() => useChargingSessions(), { wrapper: createWrapper() });
    expect(mockSupabase.channel).toHaveBeenCalledWith("charging-sessions-realtime");
  });
});
