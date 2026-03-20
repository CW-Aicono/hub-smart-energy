import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React, { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { DashboardFilterProvider, useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <DashboardFilterProvider>{children}</DashboardFilterProvider>
      </MemoryRouter>
    );
  };
}

describe("useDashboardFilter", () => {
  it("throws when used outside DashboardFilterProvider", () => {
    expect(() => {
      renderHook(() => useDashboardFilter());
    }).toThrow("useDashboardFilter must be used within a DashboardFilterProvider");
  });

  it("initializes with null location and 'day' period", () => {
    const { result } = renderHook(() => useDashboardFilter(), { wrapper: createWrapper() });
    expect(result.current.selectedLocationId).toBeNull();
    expect(result.current.selectedPeriod).toBe("day");
    expect(result.current.isPending).toBe(false);
  });

  it("updates selected location", async () => {
    const { result } = renderHook(() => useDashboardFilter(), { wrapper: createWrapper() });

    act(() => {
      result.current.setSelectedLocationId("loc-123");
    });

    await waitFor(() => {
      expect(result.current.selectedLocationId).toBe("loc-123");
    });
  });

  it("clears selected location to null", async () => {
    const { result } = renderHook(() => useDashboardFilter(), { wrapper: createWrapper() });

    act(() => {
      result.current.setSelectedLocationId("loc-123");
    });
    await waitFor(() => {
      expect(result.current.selectedLocationId).toBe("loc-123");
    });

    act(() => {
      result.current.setSelectedLocationId(null);
    });
    await waitFor(() => {
      expect(result.current.selectedLocationId).toBeNull();
    });
  });

  it("updates selected period", async () => {
    const { result } = renderHook(() => useDashboardFilter(), { wrapper: createWrapper() });

    const periods: TimePeriod[] = ["day", "week", "month", "quarter", "year", "all"];
    for (const period of periods) {
      act(() => {
        result.current.setSelectedPeriod(period);
      });
      await waitFor(() => {
        expect(result.current.selectedPeriod).toBe(period);
      });
    }
  });

  it("maintains independent state for location and period", async () => {
    const { result } = renderHook(() => useDashboardFilter(), { wrapper: createWrapper() });

    act(() => {
      result.current.setSelectedLocationId("loc-456");
      result.current.setSelectedPeriod("year");
    });

    await waitFor(() => {
      expect(result.current.selectedLocationId).toBe("loc-456");
      expect(result.current.selectedPeriod).toBe("year");
    });

    act(() => {
      result.current.setSelectedPeriod("month");
    });

    await waitFor(() => {
      expect(result.current.selectedLocationId).toBe("loc-456");
      expect(result.current.selectedPeriod).toBe("month");
    });
  });
});
