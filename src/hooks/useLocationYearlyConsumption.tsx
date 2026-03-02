import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export type ConsumptionByType = Record<string, number>;
export type ConsumptionByLocation = Record<string, ConsumptionByType>;
export type MultiYearConsumption = Record<number, ConsumptionByLocation>;

/**
 * Fetch yearly consumption per location per energy type.
 * Uses the existing RPC `get_meter_period_sums` via meters lookup.
 */
export function useLocationYearlyConsumption(
  locationIds: string[],
  years: number[],
) {
  const { tenant } = useTenant();

  return useQuery<MultiYearConsumption>({
    queryKey: ["location_yearly_consumption", tenant?.id, locationIds, years],
    queryFn: async () => {
      if (!tenant || locationIds.length === 0 || years.length === 0) return {};

      // 1. Load all meters for the given locations
      const { data: meters, error: mErr } = await supabase
        .from("meters")
        .select("id, location_id, energy_type, is_main_meter")
        .eq("tenant_id", tenant.id)
        .in("location_id", locationIds)
        .eq("is_archived", false);

      if (mErr || !meters || meters.length === 0) return {};

      const meterIds = meters.map((m) => m.id);

      const result: MultiYearConsumption = {};

      for (const year of years) {
        const fromDate = `${year}-01-01`;
        const toDate = `${year}-12-31`;

        const { data: sums, error: sErr } = await supabase.rpc(
          "get_meter_period_sums",
          { p_meter_ids: meterIds, p_from_date: fromDate, p_to_date: toDate },
        );

        if (sErr || !sums) {
          result[year] = {};
          continue;
        }

        const byLocation: ConsumptionByLocation = {};

        for (const row of sums as { meter_id: string; total_value: number }[]) {
          const meter = meters.find((m) => m.id === row.meter_id);
          if (!meter) continue;

          const locId = meter.location_id;
          const eType = meter.energy_type;

          if (!byLocation[locId]) byLocation[locId] = {};
          byLocation[locId][eType] = (byLocation[locId][eType] || 0) + row.total_value;
        }

        result[year] = byLocation;
      }

      return result;
    },
    enabled: !!tenant && locationIds.length > 0 && years.length > 0,
    staleTime: 60_000,
  });
}
