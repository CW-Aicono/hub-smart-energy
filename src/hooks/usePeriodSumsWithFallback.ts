import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

/**
 * Fetches period sums for meters.
 *
 * Uses the server-side `get_meter_period_sums_with_fallback` RPC, which
 * combines archived daily totals with on-the-fly aggregation from 5-minute
 * power readings — all in a single SQL query.
 *
 * This replaces the previous client-side fallback that paginated through
 * tens of thousands of 5-min rows for week/month/year views (~30 s).
 *
 * `placeholderData: keepPreviousData` keeps the previous result visible
 * while a new period is being fetched, so the UI never shows a blank
 * skeleton when the user switches between Tag/Woche/Monat.
 */
export function usePeriodSumsWithFallback(
  queryKeyPrefix: string,
  meterIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [queryKeyPrefix, meterIds, format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")],
    enabled: enabled && meterIds.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Record<string, number>> => {
      const fromDate = format(rangeStart, "yyyy-MM-dd");
      const toDate = format(rangeEnd, "yyyy-MM-dd");

      const { data, error } = await supabase.rpc(
        "get_meter_period_sums_with_fallback" as any,
        {
          p_meter_ids: meterIds,
          p_from_date: fromDate,
          p_to_date: toDate,
        },
      );

      if (error) throw error;

      const periodSums: Record<string, number> = {};
      (data ?? []).forEach((row: any) => {
        periodSums[row.meter_id] = row.total_value;
      });
      return periodSums;
    },
  });
}
