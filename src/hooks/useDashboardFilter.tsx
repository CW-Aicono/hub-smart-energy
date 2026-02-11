import { createContext, useContext, useState, ReactNode } from "react";

export type TimePeriod = "day" | "week" | "month" | "quarter" | "year" | "all";

interface DashboardFilterContextType {
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  selectedPeriod: TimePeriod;
  setSelectedPeriod: (period: TimePeriod) => void;
}

const DashboardFilterContext = createContext<DashboardFilterContextType | undefined>(undefined);

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("day");

  return (
    <DashboardFilterContext.Provider value={{ selectedLocationId, setSelectedLocationId, selectedPeriod, setSelectedPeriod }}>
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
