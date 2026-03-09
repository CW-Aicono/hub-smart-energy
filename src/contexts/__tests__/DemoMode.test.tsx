import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DemoModeDetector, useDemoMode, useDemoPath } from "../DemoMode";
import { ReactNode } from "react";

function wrapper(route: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>
      <DemoModeDetector>{children}</DemoModeDetector>
    </MemoryRouter>
  );
}

describe("useDemoMode", () => {
  it("returns true for /demo routes", () => {
    const { result } = renderHook(() => useDemoMode(), { wrapper: wrapper("/demo") });
    expect(result.current).toBe(true);
  });

  it("returns true for /demo/locations", () => {
    const { result } = renderHook(() => useDemoMode(), { wrapper: wrapper("/demo/locations") });
    expect(result.current).toBe(true);
  });

  it("returns false for non-demo routes", () => {
    const { result } = renderHook(() => useDemoMode(), { wrapper: wrapper("/") });
    expect(result.current).toBe(false);
  });

  it("returns false for /locations", () => {
    const { result } = renderHook(() => useDemoMode(), { wrapper: wrapper("/locations") });
    expect(result.current).toBe(false);
  });
});

describe("useDemoPath", () => {
  it("prefixes path with /demo in demo mode", () => {
    const { result } = renderHook(() => useDemoPath(), { wrapper: wrapper("/demo") });
    expect(result.current("/locations")).toBe("/demo/locations");
  });

  it("returns path unchanged outside demo mode", () => {
    const { result } = renderHook(() => useDemoPath(), { wrapper: wrapper("/") });
    expect(result.current("/locations")).toBe("/locations");
  });
});
