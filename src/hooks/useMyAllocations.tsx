import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lädt eigene 15-Minuten-Allokationen eines Mitglieds und aggregiert sie
 * auf Stunden (für die Tageskurve) sowie auf Tage (Monatssumme).
 * RLS: "Members see own readings" filtert serverseitig per E-Mail-Match.
 */
export function useMyAllocations(memberId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-allocations", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      // Bereich: aktueller Monat
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const { data, error } = await supabase
        .from("community_member_readings_15min")
        .select("ts_start, kwh, direction")
        .eq("member_id", memberId!)
        .gte("ts_start", monthStart.toISOString())
        .order("ts_start", { ascending: true });
      if (error) throw error;

      const rows = data ?? [];

      // Monatssummen (consumption / feed_in getrennt)
      let monthAllocatedKwh = 0;
      let monthFeedInKwh = 0;
      for (const r of rows) {
        const k = Number(r.kwh) || 0;
        if (r.direction === "feed_in") monthFeedInKwh += k;
        else monthAllocatedKwh += k;
      }

      // Tageskurve (heute) aggregiert auf Stunden, in kW (kWh / 0.25 h pro 15-min ist nicht aggregiertbar so;
      // Wir summieren kWh je Stunde und zeigen sie als "kWh pro Stunde" — entspricht der mittleren Leistung in kW).
      const hourlyMap = new Map<number, number>();
      for (const r of rows) {
        const ts = new Date(r.ts_start);
        if (ts < todayStart) continue;
        if (r.direction === "feed_in") continue;
        const hour = ts.getHours();
        const k = Number(r.kwh) || 0;
        hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + k);
      }
      const todayHourly = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        label: `${String(h).padStart(2, "0")}:00`,
        kw: Number((hourlyMap.get(h) ?? 0).toFixed(3)),
      }));

      const todayTotalKwh = todayHourly.reduce((s, p) => s + p.kw, 0);

      return {
        monthAllocatedKwh,
        monthFeedInKwh,
        todayTotalKwh,
        todayHourly,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
