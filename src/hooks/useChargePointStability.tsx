import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Rollierende Stabilitätsbewertung der letzten 30 Tage.
 *
 * Quelle: Tabelle `charge_point_uptime_snapshots`, in die ein pg_cron-Job
 * alle 5 Minuten je Ladepunkt einen Snapshot schreibt (online ja/nein),
 * sobald der Ladepunkt mindestens einmal verbunden war.
 *
 * Rückgabe:
 *  - `null`     → noch nie verbunden (keine Snapshots vorhanden) → UI zeigt "—"
 *  - 0…100 (%) → Anteil online-Snapshots an allen Snapshots im Fenster
 */
export function useChargePointStability(chargePointId?: string, windowDays = 30) {
  return useQuery({
    queryKey: ["charge-point-stability", chargePointId, windowDays],
    enabled: !!chargePointId,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      if (!chargePointId) return null;
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

      // count(*) = total, count(*) filter (is_online) = online
      const totalRes = await supabase
        .from("charge_point_uptime_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("charge_point_id", chargePointId)
        .gte("recorded_at", since);
      if (totalRes.error) throw totalRes.error;
      const total = totalRes.count ?? 0;
      if (total === 0) return null;

      const onlineRes = await supabase
        .from("charge_point_uptime_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("charge_point_id", chargePointId)
        .eq("is_online", true)
        .gte("recorded_at", since);
      if (onlineRes.error) throw onlineRes.error;
      const online = onlineRes.count ?? 0;

      return Math.round((online / total) * 10000) / 100; // 2 Nachkommastellen
    },
  });
}
