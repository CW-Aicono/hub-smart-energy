import { useTenant } from "@/hooks/useTenant";

/**
 * Returns the tenant's configured week start day (0=Sun … 6=Sat).
 * Falls back to Monday (1) when no tenant is loaded.
 */
export function useWeekStartDay(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const { tenant } = useTenant();
  return tenant?.week_start_day ?? 1;
}
