import { createContext, useContext, useState, useTransition, useCallback, ReactNode } from "react";

export type TimePeriod = "day" | "week" | "month" | "quarter" | "year" | "all";

interface DashboardFilterContextType {
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  selectedPeriod: TimePeriod;
  setSelectedPeriod: (period: TimePeriod) => void;
  /** Shared date offset (0 = current period, -1 = previous, etc.) */
  selectedOffset: number;
  setSelectedOffset: (offset: number | ((prev: number) => number)) => void;
  /** True while React is processing a low-priority location/period transition */
  isPending: boolean;
}

const DashboardFilterContext = createContext<DashboardFilterContextType | undefined>(undefined);

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [selectedLocationId, setLocationId] = useState<string | null>(null);
  const [selectedPeriod, setPeriodRaw] = useState<TimePeriod>("day");
  const [selectedOffset, setOffsetRaw] = useState(0);
  const [isPending, startTransition] = useTransition();

  const setSelectedLocationId = useCallback((id: string | null) => {
    startTransition(() => {
      setLocationId((prev) => (prev === id ? prev : id));
    });
  }, []);

  const setSelectedPeriod = useCallback((period: TimePeriod) => {
    startTransition(() => {
      setPeriodRaw((prev) => {
        if (prev === period) return prev;
        // Reset offset when period changes
        setOffsetRaw(0);
        return period;
      });
    });
  }, []);

  const setSelectedOffset = useCallback((offset: number | ((prev: number) => number)) => {
    setOffsetRaw(offset);
  }, []);

  return (
    <DashboardFilterContext.Provider value={{ selectedLocationId, setSelectedLocationId, selectedPeriod, setSelectedPeriod, selectedOffset, setSelectedOffset, isPending }}>
      {children}
    </DashboardFilterContext.Provider>
  );
}

export function useDashboardFilter(): DashboardFilterContextType {
  const context = useContext(DashboardFilterContext);
  if (!context) {
    throw new Error("useDashboardFilter must be used within a DashboardFilterProvider");
  }
  return context;
}
