import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { ReactNode } from "react";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("../useTenant", () => ({
  useTenant: () => ({ tenant: { id: "t-1" }, loading: false }),
}));
vi.mock("../useAuth", () => ({
  useAuth: () => ({ user: { id: "u-1", email: "test@test.de" }, session: {}, loading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { useTasks } from "../useTasks";

function chainMock(data: any, error: any = null) {
  const resolveValue = { data, error };
  const obj: any = {
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    update: vi.fn(() => obj),
    delete: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    in: vi.fn(() => obj),
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

describe("useTasks", () => {
  it("fetches tasks for tenant", async () => {
    const tasks = [
      { id: "task-1", title: "Fix leak", status: "open", priority: "high", tenant_id: "t-1" },
    ];
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "tasks") return chainMock(tasks);
      if (table === "profiles") return chainMock([]);
      return chainMock([]);
    });

    const { result } = renderHook(() => useTasks(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tasks).toEqual(tasks);
  });

  it("exposes mutation functions", async () => {
    mockSupabase.from.mockReturnValue(chainMock([]));

    const { result } = renderHook(() => useTasks(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.createTask).toBeDefined();
    expect(result.current.updateTask).toBeDefined();
    expect(result.current.deleteTask).toBeDefined();
    expect(result.current.bulkUpdateStatus).toBeDefined();
    expect(result.current.addComment).toBeDefined();
    expect(result.current.deleteAllArchived).toBeDefined();
  });
});
