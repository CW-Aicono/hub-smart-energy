import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Meter } from "./useMeters";

export interface LatestMeterValue {
  value: number;
  at: string | null;
}

/**
 * Loads the latest reading for a list of manual/virtual meters.
 * - manual → meter_readings (latest per meter_id)
 * - virtual/automatic → meter_cumulative_readings (latest per meter_id)
 */
export function useLatestMeterValues(meters: Meter[]) {
  const [values, setValues] = useState<Map<string, LatestMeterValue>>(new Map());
  const [loading, setLoading] = useState(false);

  const ids = meters.map((m) => m.id).sort().join(",");

  useEffect(() => {
    if (meters.length === 0) {
      setValues(new Map());
      return;
    }

    const manualIds = meters.filter((m) => m.capture_type === "manual").map((m) => m.id);
    const otherIds = meters.filter((m) => m.capture_type !== "manual").map((m) => m.id);

    let cancelled = false;
    setLoading(true);

    const run = async () => {
      const next = new Map<string, LatestMeterValue>();

      if (manualIds.length > 0) {
        const { data } = await supabase
          .from("meter_readings")
          .select("meter_id, value, reading_date")
          .in("meter_id", manualIds)
          .order("reading_date", { ascending: false });
        (data ?? []).forEach((r: any) => {
          if (!next.has(r.meter_id)) next.set(r.meter_id, { value: Number(r.value), at: r.reading_date });
        });
      }

      if (otherIds.length > 0) {
        const { data } = await supabase
          .from("meter_cumulative_readings")
          .select("meter_id, kwh_total, reading_at")
          .in("meter_id", otherIds)
          .order("reading_at", { ascending: false })
          .limit(1000);
        (data ?? []).forEach((r: any) => {
          if (!next.has(r.meter_id)) next.set(r.meter_id, { value: Number(r.kwh_total), at: r.reading_at });
        });
      }

      if (!cancelled) {
        setValues(next);
        setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return { values, loading };
}
