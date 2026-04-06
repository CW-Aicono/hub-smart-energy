import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, eachDayOfInterval, startOfDay, endOfDay } from "date-fns";

/**
 * Fetches period sums for meters, with a fallback for days missing from
 * the archived `meter_period_totals` table. Missing days are computed
 * on-the-fly from 5-minute power readings (same logic as EnergyChart).
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
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const fromDate = format(rangeStart, "yyyy-MM-dd");
      const toDate = format(rangeEnd, "yyyy-MM-dd");

      // 1. Get archived period sums
      const [sumsRes, dailyRes] = await Promise.all([
        supabase.rpc("get_meter_period_sums", {
          p_meter_ids: meterIds,
          p_from_date: fromDate,
          p_to_date: toDate,
        }),
        supabase.rpc("get_meter_daily_totals", {
          p_meter_ids: meterIds,
          p_from_date: fromDate,
          p_to_date: toDate,
        }),
      ]);

      const periodSums: Record<string, number> = {};
      (sumsRes.data ?? []).forEach((row: any) => {
        periodSums[row.meter_id] = row.total_value;
      });

      // 2. Find days with archived daily data
      const daysWithData = new Set<string>();
      (dailyRes.data ?? []).forEach((row: any) => {
        const dayStr = typeof row.day === "string" ? row.day.split("T")[0] : format(new Date(row.day), "yyyy-MM-dd");
        daysWithData.add(dayStr);
      });

      // 3. Find missing days (up to today — today is covered by live totalDay)
      const today = format(new Date(), "yyyy-MM-dd");
      const effectiveEnd = new Date(Math.min(rangeEnd.getTime(), new Date().getTime()));
      const daysInRange = eachDayOfInterval({ start: rangeStart, end: effectiveEnd });
      const missingDays = daysInRange
        .map(d => format(d, "yyyy-MM-dd"))
        .filter(d => d !== today && !daysWithData.has(d));

      if (missingDays.length === 0) return periodSums;

      // 4. Fetch 5-min readings for missing days (paginated)
      const missingStart = startOfDay(new Date(missingDays[0])).toISOString();
      const missingEnd = endOfDay(new Date(missingDays[missingDays.length - 1])).toISOString();

      let allPowerData: Array<{ meter_id: string; power_avg: number; bucket: string }> = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data: pageData } = await supabase
          .rpc("get_power_readings_5min", {
            p_meter_ids: meterIds,
            p_start: missingStart,
            p_end: missingEnd,
          })
          .range(from, from + pageSize - 1);
        if (!pageData || pageData.length === 0) {
          hasMore = false;
        } else {
          allPowerData.push(...(pageData as any[]));
          hasMore = pageData.length === pageSize;
          from += pageSize;
        }
      }

      if (allPowerData.length === 0) return periodSums;

      // 5. Aggregate missing days into per-meter totals
      const missingSet = new Set(missingDays);
      const meterFallback: Record<string, number> = {};
      for (const row of allPowerData) {
        const dayStr = format(new Date(row.bucket), "yyyy-MM-dd");
        if (!missingSet.has(dayStr)) continue;
        meterFallback[row.meter_id] = (meterFallback[row.meter_id] ?? 0) + (row.power_avg * 5.0 / 60.0);
      }

      // 6. Merge fallback into period sums
      for (const [meterId, fallbackVal] of Object.entries(meterFallback)) {
        if (fallbackVal !== 0) {
          periodSums[meterId] = (periodSums[meterId] ?? 0) + fallbackVal;
        }
      }

      return periodSums;
    },
  });
}
