import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, subDays } from "date-fns";

export interface DailyUptime {
  date: string; // yyyy-MM-dd
  total: number;
  online: number;
  onlinePct: number; // 0..100, NaN if total=0
}

/**
 * Liefert je Tag den Online-Anteil aus `charge_point_uptime_snapshots` (5-Min-Raster).
 * Für Tage ohne Snapshots ist `total = 0` und `onlinePct = NaN`.
 */
export function useChargePointDailyUptime(chargePointId?: string, days = 7) {
  return useQuery({
    queryKey: ["cp-daily-uptime", chargePointId, days],
    enabled: !!chargePointId,
    staleTime: 60_000,
    queryFn: async (): Promise<DailyUptime[]> => {
      const since = startOfDay(subDays(new Date(), days - 1)).toISOString();
      const { data, error } = await supabase
        .from("charge_point_uptime_snapshots")
        .select("recorded_at, is_online")
        .eq("charge_point_id", chargePointId!)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: true })
        .limit(20000);
      if (error) throw error;

      const buckets = new Map<string, { total: number; online: number }>();
      for (let i = days - 1; i >= 0; i--) {
        const key = format(subDays(new Date(), i), "yyyy-MM-dd");
        buckets.set(key, { total: 0, online: 0 });
      }
      (data || []).forEach((row: { recorded_at: string; is_online: boolean }) => {
        const key = format(new Date(row.recorded_at), "yyyy-MM-dd");
        const b = buckets.get(key);
        if (!b) return;
        b.total += 1;
        if (row.is_online) b.online += 1;
      });

      return Array.from(buckets.entries()).map(([date, b]) => ({
        date,
        total: b.total,
        online: b.online,
        onlinePct: b.total > 0 ? (b.online / b.total) * 100 : NaN,
      }));
    },
  });
}
