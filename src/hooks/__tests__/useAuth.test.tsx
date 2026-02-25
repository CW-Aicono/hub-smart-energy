import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createTestWrapper, createDemoWrapper } from "@/test/helpers";

// ── Mock supabase client (hoisted) ──────────────────────────────────────────
const { mockSupabase } = vi.hoisted(() => {
  const mock = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(),
  };
  return { mockSupabase: mock };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import { useAuth } from "../useAuth";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  mockSupabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used within AuthProvider");
    spy.mockRestore();
  });

  it("starts with loading=true and resolves to null user when no session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createTestWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it("provides a demo user in demo mode", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createDemoWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).not.toBeNull();
    expect(result.current.user!.id).toBe("demo-user-id");
    expect(result.current.user!.email).toBe("demo@smartenergy.de");
  });

  it("calls signInWithPassword on signIn", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper: createTestWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const { error } = await result.current.signIn("a@b.de", "pw");
      expect(error).toBeNull();
    });
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.de", password: "pw" });
  });

  it("returns error from signIn on failure", async () => {
    const fakeError = new Error("Invalid credentials");
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: fakeError });
    const { result } = renderHook(() => useAuth(), { wrapper: createTestWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const { error } = await result.current.signIn("bad@mail.de", "wrong");
      expect(error).toBe(fakeError);
    });
  });

  it("signOut is a no-op in demo mode", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createDemoWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.signOut(); });
    expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
  });
});
