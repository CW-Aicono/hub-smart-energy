import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "./useTenant";
import { gasM3ToKWh } from "@/lib/formatEnergy";

export interface MonthlyConsumptionPoint {
  monthIndex: number; // 0..11
  value: number; // Wh (base unit for formatEnergy)
}

interface Options {
  locationId?: string | null;
  energyType: string; // "strom" | "gas" | "waerme" | "wasser"
  year?: number;
}

/**
 * Returns monthly consumption for a given energy type using `meter_period_totals`
 * — the SAME source that the weather-normalization analysis uses, so values match.
 *
 * Values are returned in Wh (base unit of formatEnergy). For gas (m³) values are
 * converted to kWh (and then Wh) using the meter's brennwert / zustandszahl when
 * available, otherwise the default factor.
 */
export function useMonthlyConsumptionByType({ locationId, energyType, year }: Options) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const selectedYear = year ?? new Date().getFullYear();

  return useQuery({
    queryKey: ["monthly-consumption-by-type", tenant?.id, locationId ?? "all", energyType, selectedYear],
    queryFn: async (): Promise<MonthlyConsumptionPoint[]> => {
      if (!tenant) return [];

      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      const emptyMonths = Array.from({ length: 12 }, (_, i) => ({ monthIndex: i, value: 0 }));

      // Resolve eligible main meters for this energy type (and location if given)
      let metersQuery = supabase
        .from("meters")
        .select("id, location_id, unit, gas_type, brennwert, zustandszahl")
        .eq("tenant_id", tenant.id)
        .eq("energy_type", energyType)
        .eq("is_main_meter", true)
        .eq("is_archived", false);

      if (locationId) metersQuery = metersQuery.eq("location_id", locationId);

      const { data: meters } = await metersQuery;
      const meterMap: Record<
        string,
        { unit: string; gas_type: string | null; brennwert: number | null; zustandszahl: number | null }
      > = {};
      for (const m of meters || []) {
        meterMap[m.id] = {
          unit: (m as any).unit,
          gas_type: (m as any).gas_type ?? null,
          brennwert: (m as any).brennwert ?? null,
          zustandszahl: (m as any).zustandszahl ?? null,
        };
      }
      const meterIds = new Set(Object.keys(meterMap));
      if (meterIds.size === 0) {
        return emptyMonths;
      }

      const toWh = (rawValue: number, meterId: string): number => {
        const m = meterMap[meterId];
        if (!m) return rawValue * 1000;
        if (energyType === "gas" && m.unit === "m³") {
          const kWh = gasM3ToKWh(rawValue, m.gas_type, m.brennwert, m.zustandszahl);
          return kWh * 1000;
        }
        return rawValue * 1000;
      };

      // Monthly totals
      const { data: monthlyRows } = await supabase
        .from("meter_period_totals")
        .select("period_start, total_value, meter_id")
        .eq("tenant_id", tenant.id)
        .eq("period_type", "month")
        .eq("energy_type", energyType)
        .gte("period_start", startDate)
        .lte("period_start", endDate);

      const monthlyByKey: Record<string, number> = {};
      for (const row of monthlyRows || []) {
        if (!meterIds.has(row.meter_id)) continue;
        const key = (row.period_start as string).substring(0, 7); // YYYY-MM
        monthlyByKey[key] = (monthlyByKey[key] || 0) + toWh(row.total_value as number, row.meter_id);
      }

      // For the current month always rebuild from daily rows (monthly aggregate may lag)
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      if (selectedYear === now.getFullYear()) {
        const dStart = `${currentMonthKey}-01`;
        const dEnd = `${currentMonthKey}-31`;
        const { data: dailyRows } = await supabase
          .from("meter_period_totals")
          .select("period_start, total_value, meter_id")
          .eq("tenant_id", tenant.id)
          .eq("period_type", "day")
          .eq("energy_type", energyType)
          .gte("period_start", dStart)
          .lte("period_start", dEnd);

        let currentSum = 0;
        for (const row of dailyRows || []) {
          if (!meterIds.has(row.meter_id)) continue;
          currentSum += toWh(row.total_value as number, row.meter_id);
        }
        monthlyByKey[currentMonthKey] = currentSum;
      }

      const result: MonthlyConsumptionPoint[] = [];
      for (let i = 0; i < 12; i++) {
        const key = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
        result.push({ monthIndex: i, value: monthlyByKey[key] || 0 });
      }
      return result.length === 12 ? result : emptyMonths;
    },
    enabled: !!user && !!tenant && !!energyType,
    staleTime: 60_000,
  });
}
