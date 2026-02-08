import { createContext, useContext, useState, ReactNode } from "react";

interface DashboardFilterContextType {
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
}

const DashboardFilterContext = createContext<DashboardFilterContextType | undefined>(undefined);

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  return (
    <DashboardFilterContext.Provider value={{ selectedLocationId, setSelectedLocationId }}>
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
