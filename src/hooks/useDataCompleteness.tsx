import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface MonthStatus {
  month: number; // 1-12
  hasData: boolean;
  meterCount: number;
  metersWithData: number;
}

export interface LocationCompleteness {
  locationId: string;
  months: MonthStatus[];
  monthsComplete: number;
  totalMonths: number;
  completenessPercent: number;
  missingMonths: string[];
}

export type CompletenessMap = Record<string, LocationCompleteness>;

export function useDataCompleteness(locationIds: string[], year: number) {
  const { tenant } = useTenant();

  return useQuery<CompletenessMap>({
    queryKey: ["data_completeness", tenant?.id, locationIds, year],
    queryFn: async () => {
      if (!tenant || locationIds.length === 0) return {};

      // Get main meters per location
      const { data: meters } = await supabase
        .from("meters")
        .select("id, location_id, energy_type, is_main_meter")
        .eq("tenant_id", tenant.id)
        .in("location_id", locationIds)
        .eq("is_archived", false)
        .eq("is_main_meter", true);

      if (!meters || meters.length === 0) return {};

      const meterIds = meters.map((m) => m.id);

      // Get daily totals for the year
      const { data: dailyTotals } = await supabase.rpc("get_meter_daily_totals", {
        p_meter_ids: meterIds,
        p_from_date: `${year}-01-01`,
        p_to_date: `${year}-12-31`,
      });

      // Build month presence per meter
      const meterMonths = new Map<string, Set<number>>();
      if (dailyTotals) {
        for (const row of dailyTotals as { meter_id: string; day: string; total_value: number }[]) {
          const month = new Date(row.day).getMonth() + 1;
          if (!meterMonths.has(row.meter_id)) meterMonths.set(row.meter_id, new Set());
          meterMonths.get(row.meter_id)!.add(month);
        }
      }

      const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
      const result: CompletenessMap = {};

      for (const locId of locationIds) {
        const locMeters = meters.filter((m) => m.location_id === locId);
        const monthStatuses: MonthStatus[] = [];
        let complete = 0;
        const missing: string[] = [];

        for (let m = 1; m <= 12; m++) {
          const withData = locMeters.filter((meter) => meterMonths.get(meter.id)?.has(m)).length;
          const hasData = withData > 0;
          monthStatuses.push({ month: m, hasData, meterCount: locMeters.length, metersWithData: withData });
          if (hasData) complete++;
          else missing.push(monthNames[m - 1]);
        }

        result[locId] = {
          locationId: locId,
          months: monthStatuses,
          monthsComplete: complete,
          totalMonths: 12,
          completenessPercent: Math.round((complete / 12) * 100),
          missingMonths: missing,
        };
      }

      return result;
    },
    enabled: !!tenant && locationIds.length > 0,
    staleTime: 60_000,
  });
}
