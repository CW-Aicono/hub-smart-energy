/**
 * useRealtimeDataInvalidation
 *
 * Subscribes ONCE (per dashboard mount) to `meter_power_readings` INSERTs and
 * invalidates the React Query caches that feed the dashboard widgets the moment
 * a new 5-min datapoint lands. This replaces the previous "every widget polls
 * every 60 s" pattern with event-driven updates.
 *
 * Behaviour:
 *  - Throttled: at most one invalidation cycle every 2 s (a 5-min ingest job
 *    can write hundreds of rows in a burst – we don't want hundreds of refetches).
 *  - A 5-minute background polling fallback remains active in each individual
 *    widget hook in case the WebSocket connection silently drops.
 *  - Real-time gauges keep using `useRealtimePower` directly (sub-second).
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Query-key prefixes invalidated whenever new meter data arrives. */
const INVALIDATED_KEYS: string[][] = [
  ["energy-data"],
  ["energy-readings-and-sources"],
  ["cost-overview"],
  ["sustainability-kpis"],
  ["pie-chart"],
  ["sankey"],
  ["forecast"],
  ["anomaly"],
  ["weather-normalization"],
  ["energy-gauge"],
  ["custom-widget"],
  ["pv-forecast-actual"],
  ["pv-actual"],
  ["meter_power_readings"],
  ["meter_period_totals"],
  ["period-sums"],
  ["meter-daily-totals"],
  ["gateway-live-power"],
  ["data_completeness"],
];

const THROTTLE_MS = 2000;

export function useRealtimeDataInvalidation() {
  const queryClient = useQueryClient();
  const lastRunRef = useRef<number>(0);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(() => new Date());

  useEffect(() => {
    const invalidate = () => {
      INVALIDATED_KEYS.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      setLastUpdate(new Date());
    };

    const throttledInvalidate = () => {
      const now = Date.now();
      const elapsed = now - lastRunRef.current;
      if (elapsed >= THROTTLE_MS) {
        lastRunRef.current = now;
        invalidate();
        return;
      }
      // Schedule a trailing call so the very last burst row still triggers a refresh
      if (pendingTimerRef.current) return;
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        lastRunRef.current = Date.now();
        invalidate();
      }, THROTTLE_MS - elapsed);
    };

    const channel = supabase
      .channel("dashboard-data-invalidation")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meter_power_readings" },
        throttledInvalidate,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meter_readings" },
        throttledInvalidate,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meter_period_totals" },
        throttledInvalidate,
      )
      .subscribe();

    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { lastUpdate };
}
