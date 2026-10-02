import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

export interface DailyUptime {
  date: string; // yyyy-MM-dd
  total: number;
  online: number;
  onlinePct: number; // 0..100, NaN if total=0
}

/**
 * Liefert je Tag den Online-Anteil aus `charge_point_uptime_snapshots` (5-Min-Raster).
 * Aggregation läuft serverseitig via RPC `get_charge_point_daily_uptime`
 * (vermeidet PostgREST-Zeilenlimit). Für Tage ohne Snapshots ist `total = 0`
 * und `onlinePct = NaN`.
 */
export function useChargePointDailyUptime(chargePointId?: string, days = 7) {
  return useQuery({
    queryKey: ["cp-daily-uptime", chargePointId, days],
    enabled: !!chargePointId,
    staleTime: 60_000,
    queryFn: async (): Promise<DailyUptime[]> => {
      const { data, error } = await supabase.rpc("get_charge_point_daily_uptime", {
        p_charge_point_id: chargePointId!,
        p_days: days,
      });
      if (error) throw error;

      // Fallback: alle Tage initialisieren, damit auch ohne Server-Antwort
      // (z. B. fehlende Berechtigung) eine vollständige Wochenleiste entsteht.
      const buckets = new Map<string, { total: number; online: number }>();
      for (let i = days - 1; i >= 0; i--) {
        const key = format(subDays(new Date(), i), "yyyy-MM-dd");
        buckets.set(key, { total: 0, online: 0 });
      }
      (data || []).forEach((row: { day: string; total: number | string; online: number | string }) => {
        // RPC liefert `day` als ISO-Date-String (yyyy-MM-dd).
        const key = typeof row.day === "string" ? row.day.slice(0, 10) : row.day;
        const total = Number(row.total) || 0;
        const online = Number(row.online) || 0;
        buckets.set(key, { total, online });
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
