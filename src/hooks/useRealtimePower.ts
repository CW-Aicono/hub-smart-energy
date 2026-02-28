import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RealtimePowerReading {
  meter_id: string;
  power_value: number;
  recorded_at: string;
}

/**
 * Subscribes to meter_power_readings via Supabase Realtime.
 * Returns the latest power value per meter, updated in <1s.
 */
export function useRealtimePower(meterIds: string[]) {
  const [latestByMeter, setLatestByMeter] = useState<Record<string, number>>({});
  const [peakByMeter, setPeakByMeter] = useState<Record<string, number>>({});
  const meterIdsRef = useRef<Set<string>>(new Set());

  // Keep the meter set in sync without triggering subscription recreation
  useEffect(() => {
    meterIdsRef.current = new Set(meterIds);
  }, [meterIds]);

  // Reset state when meter list changes fundamentally
  const meterKey = meterIds.slice().sort().join(",");

  useEffect(() => {
    if (meterIds.length === 0) return;

    const channel = supabase
      .channel("realtime-power-gauges")
      .on<RealtimePowerReading>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meter_power_readings",
        },
        (payload) => {
          const row = payload.new;
          if (!meterIdsRef.current.has(row.meter_id)) return;

          const value = Math.abs(row.power_value);

          setLatestByMeter((prev) => ({
            ...prev,
            [row.meter_id]: value,
          }));

          setPeakByMeter((prev) => ({
            ...prev,
            [row.meter_id]: Math.max(prev[row.meter_id] ?? 0, value),
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meterKey]);

  const resetPeaks = useCallback(() => {
    setPeakByMeter({});
  }, []);

  return { latestByMeter, peakByMeter, resetPeaks };
}
