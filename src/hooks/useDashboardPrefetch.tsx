/**
 * useDashboardPrefetch
 *
 * Fires all shared data queries at the dashboard level so they're already
 * in React Query cache when individual widgets mount (via LazyWidget).
 * This separates data fetching from rendering – widgets render lazily
 * but their data is available instantly from cache.
 */

import { useMeters } from "./useMeters";
import { useEnergyData } from "./useEnergyData";
import { useLocations } from "./useLocations";
import { useAlertRules } from "./useAlertRules";
import { useEnergyPrices } from "./useEnergyPrices";
import { useRealtimeDataInvalidation } from "./useRealtimeDataInvalidation";

export function useDashboardPrefetch(locationId?: string | null) {
  // These hooks use React Query internally – calling them here ensures
  // the queries fire immediately when the dashboard mounts, not when
  // individual widgets scroll into view.
  useMeters();
  useLocations();
  useEnergyData(locationId);
  useAlertRules();
  useEnergyPrices();

  // Subscribe ONCE to meter data inserts → invalidate widget caches in real-time
  // (replaces per-widget 60 s polling). Each widget keeps a 5 min fallback poll.
  const { lastUpdate } = useRealtimeDataInvalidation();

  return { lastUpdate };
}
