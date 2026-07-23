import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useModuleGuard } from "@/hooks/useModuleGuard";
import type { WidgetAvailabilitySignals } from "@/lib/widgetRequirements";

const has = (count: number | null | undefined) => (count ?? 0) > 0;

/**
 * Bundles lightweight COUNT queries that decide whether a dashboard widget
 * has meaningful data to display. Cached per tenant + selected location.
 */
export function useWidgetAvailability(selectedLocationId: string | null) {
  const { tenant } = useTenant();
  const { isModuleEnabled } = useModuleGuard();
  const tenantId = tenant?.id ?? null;

  const query = useQuery({
    queryKey: ["widget-availability", tenantId, selectedLocationId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Omit<WidgetAvailabilitySignals, "arbitrageModuleEnabled" | "gainSharingModuleEnabled">> => {
      const locFilter = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
        selectedLocationId ? q.eq("location_id", selectedLocationId) : q;

      const head = { count: "exact" as const, head: true };

      const [
        metersRes,
        pvSourceRes,
        pvMeterRes,
        gasHeatMeterRes,
        floorsRes,
        energyPricesRes,
        electricityTariffRes,
        dynamicPriceRes,
        arbitrageStratRes,
        ppaRes,
        savingsRes,
        integrationErrRes,
        locationCountRes,
      ] = await Promise.all([
        locFilter(supabase.from("meters").select("id", head).eq("tenant_id", tenantId!)),
        locFilter(supabase.from("location_energy_sources").select("id", head).eq("tenant_id", tenantId!).eq("energy_type", "pv")),
        locFilter(supabase.from("meters").select("id", head).eq("tenant_id", tenantId!).eq("energy_type", "pv")),
        locFilter(supabase.from("meters").select("id", head).eq("tenant_id", tenantId!).in("energy_type", ["gas", "heat", "heating"])),
        selectedLocationId
          ? supabase.from("floors").select("id", head).eq("location_id", selectedLocationId).not("floor_plan_url", "is", null)
          : supabase.from("floors").select("id", head).not("floor_plan_url", "is", null),
        locFilter(supabase.from("energy_prices").select("id", head).eq("tenant_id", tenantId!)),
        supabase.from("tenant_electricity_tariffs").select("id", head).eq("tenant_id", tenantId!),
        locFilter(supabase.from("energy_prices").select("id", head).eq("tenant_id", tenantId!).eq("is_dynamic", true)),
        supabase.from("arbitrage_strategies").select("id", head).eq("tenant_id", tenantId!).eq("is_active", true),
        supabase.from("ppa_contracts").select("id", head).eq("tenant_id", tenantId!),
        supabase.from("tenant_savings_contracts").select("id", head).eq("tenant_id", tenantId!),
        locFilter(supabase.from("integration_errors").select("id", head).eq("tenant_id", tenantId!).is("resolved_at", null)),
        supabase.from("locations").select("id", head).eq("tenant_id", tenantId!),
      ]);

      return {
        hasMeter: has(metersRes.count),
        hasPvSource: has(pvSourceRes.count) || has(pvMeterRes.count),
        hasGasOrHeatMeter: has(gasHeatMeterRes.count),
        hasFloorPlan: has(floorsRes.count),
        hasCostTariff: has(energyPricesRes.count) || has(electricityTariffRes.count),
        hasDynamicTariff: has(dynamicPriceRes.count),
        hasArbitrageStrategy: has(arbitrageStratRes.count),
        hasPpaContract: has(ppaRes.count),
        hasSavingsContract: has(savingsRes.count),
        hasIntegrationError: has(integrationErrRes.count),
        hasMultipleLocations: (locationCountRes.count ?? 0) >= 2,
      };
    },
  });

  const signals: WidgetAvailabilitySignals | null = query.data
    ? {
        ...query.data,
        arbitrageModuleEnabled: isModuleEnabled("arbitrage_trading"),
        gainSharingModuleEnabled: isModuleEnabled("gain_sharing"),
      }
    : null;

  return { signals, isReady: !query.isLoading, isLoading: query.isLoading };
}
