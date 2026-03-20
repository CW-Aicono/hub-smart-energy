import { createContext, useContext, useState, useTransition, useCallback, ReactNode } from "react";

export type TimePeriod = "day" | "week" | "month" | "quarter" | "year" | "all";

interface DashboardFilterContextType {
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  selectedPeriod: TimePeriod;
  setSelectedPeriod: (period: TimePeriod) => void;
  /** True while React is processing a low-priority location/period transition */
  isPending: boolean;
}

const DashboardFilterContext = createContext<DashboardFilterContextType | undefined>(undefined);

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [selectedLocationId, setLocationId] = useState<string | null>(null);
  const [selectedPeriod, setPeriodRaw] = useState<TimePeriod>("day");
  const [isPending, startTransition] = useTransition();

  const setSelectedLocationId = useCallback((id: string | null) => {
    startTransition(() => {
      setLocationId(id);
    });
  }, []);

  const setSelectedPeriod = useCallback((period: TimePeriod) => {
    startTransition(() => {
      setPeriodRaw(period);
    });
  }, []);

  return (
    <DashboardFilterContext.Provider value={{ selectedLocationId, setSelectedLocationId, selectedPeriod, setSelectedPeriod, isPending }}>
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
