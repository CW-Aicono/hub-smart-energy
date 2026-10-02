import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

/**
 * Autoritative Energiemengen aus `meter_period_totals` (Tageszeilen).
 *
 * Exakt dieselbe Quelle wie die Kacheln auf der Live-Werte-Seite bzw. im
 * Dashboard ("Gesamt heute"). Der Detaildialog nutzt denselben Hook, damit
 * beide Ansichten nicht auseinanderlaufen.
 *
 * `from`/`to` sind Kalendertage (inklusive) in lokaler Zeit.
 */
export function useMeterPeriodTotals(
  meterIds: string[],
  from: Date,
  to: Date,
  enabled = true,
) {
  const fromDate = format(from, "yyyy-MM-dd");
  const toDate = format(to, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["meter_period_totals", "day-sum", meterIds, fromDate, toDate],
    enabled: enabled && meterIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("meter_period_totals")
        .select("meter_id, total_value")
        .in("meter_id", meterIds)
        .eq("period_type", "day")
        .gte("period_start", fromDate)
        .lte("period_start", toDate);

      if (error) throw error;

      const sums: Record<string, number> = {};
      for (const row of (data ?? []) as any[]) {
        const v = Number(row.total_value);
        if (!Number.isFinite(v)) continue;
        sums[row.meter_id] = (sums[row.meter_id] ?? 0) + v;
      }
      return sums;
    },
  });
}
