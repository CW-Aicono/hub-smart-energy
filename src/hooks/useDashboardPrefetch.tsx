/**
 * useDashboardPrefetch
 *
 * Fires all shared data queries at the dashboard level so they're already
 * in React Query cache when individual widgets mount (via LazyWidget).
 * This separates data fetching from rendering – widgets render lazily
 * but their data is available instantly from cache.
 */

import { useEffect } from "react";
import { useMeters } from "./useMeters";
import { useEnergyData } from "./useEnergyData";
import { useLocations } from "./useLocations";
import { useAlertRules } from "./useAlertRules";
import { useEnergyPrices } from "./useEnergyPrices";
import { useRealtimeDataInvalidation } from "./useRealtimeDataInvalidation";
import { probeMark } from "@/lib/perfProbe"; // PERF-PROBE

export function useDashboardPrefetch(locationId?: string | null) {
  // These hooks use React Query internally – calling them here ensures
  // the queries fire immediately when the dashboard mounts, not when
  // individual widgets scroll into view.
  const meters = useMeters();
  const locations = useLocations();
  const energyData = useEnergyData(locationId);
  const alertRules = useAlertRules();
  const energyPrices = useEnergyPrices();

  // PERF-PROBE – log first-settle timings per sub-hook
  useEffect(() => { probeMark("prefetch:mounted", { once: true }); }, []);
  useEffect(() => { if (!meters.loading) probeMark("prefetch:meters settled", { once: true }); }, [meters.loading]);
  useEffect(() => { if (!locations.loading) probeMark("prefetch:locations settled", { once: true }); }, [locations.loading]);
  useEffect(() => { if (!energyData.loading) probeMark("prefetch:energyData settled", { once: true }); }, [energyData.loading]);
  useEffect(() => { if (!alertRules.loading) probeMark("prefetch:alertRules settled", { once: true }); }, [alertRules.loading]);
  useEffect(() => { if (!energyPrices.loading) probeMark("prefetch:energyPrices settled", { once: true }); }, [energyPrices.loading]);

  // Subscribe ONCE to meter data inserts → invalidate widget caches in real-time
  // (replaces per-widget 60 s polling). Each widget keeps a 5 min fallback poll.
  const { lastUpdate } = useRealtimeDataInvalidation();

  return { lastUpdate };
}
