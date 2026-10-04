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

const VALID_PERIODS: TimePeriod[] = ["day", "week", "month", "quarter", "year", "all"];

/**
 * Gibt einer einzelnen Dashboard-Grafik einen eigenen Zeitraum.
 * Liegenschaft kommt weiter vom übergeordneten Filter; Zeitraum/Offset
 * sind lokal und werden über `onChange` dauerhaft gespeichert.
 */
export function WidgetPeriodScope({
  children,
  initialPeriod,
  initialOffset,
  onChange,
}: {
  children: ReactNode;
  initialPeriod?: unknown;
  initialOffset?: unknown;
  onChange?: (period: TimePeriod, offset: number) => void;
}) {
  const parent = useDashboardFilter();
  const [period, setPeriodRaw] = useState<TimePeriod>(
    VALID_PERIODS.includes(initialPeriod as TimePeriod) ? (initialPeriod as TimePeriod) : "day",
  );
  const [offset, setOffsetRaw] = useState<number>(
    typeof initialOffset === "number" && Number.isFinite(initialOffset) ? initialOffset : 0,
  );
  const [isPending, startTransition] = useTransition();

  const setSelectedPeriod = useCallback((p: TimePeriod) => {
    startTransition(() => {
      setPeriodRaw((prev) => {
        if (prev === p) return prev;
        setOffsetRaw(0);
        onChange?.(p, 0);
        return p;
      });
    });
  }, [onChange]);

  const setSelectedOffset = useCallback((o: number | ((prev: number) => number)) => {
    setOffsetRaw((prev) => {
      const next = typeof o === "function" ? o(prev) : o;
      setPeriodRaw((p) => { onChange?.(p, next); return p; });
      return next;
    });
  }, [onChange]);

  return (
    <DashboardFilterContext.Provider
      value={{
        selectedLocationId: parent.selectedLocationId,
        setSelectedLocationId: parent.setSelectedLocationId,
        selectedPeriod: period,
        setSelectedPeriod,
        selectedOffset: offset,
        setSelectedOffset,
        isPending: isPending || parent.isPending,
      }}
    >
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
