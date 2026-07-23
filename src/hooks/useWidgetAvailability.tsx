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
    queryFn: async (): Promise<
      Omit<WidgetAvailabilitySignals, "arbitrageModuleEnabled" | "gainSharingModuleEnabled">
    > => {
      const loc = selectedLocationId;
      const head = { count: "exact" as const, head: true };

      // Build queries; conditionally apply location filter after typing narrows.
      const metersQ = supabase.from("meters").select("id", head).eq("tenant_id", tenantId!);
      const pvSourceQ = supabase
        .from("location_energy_sources")
        .select("id", head)
        .eq("tenant_id", tenantId!)
        .eq("energy_type", "pv");
      const pvMeterQ = supabase
        .from("meters")
        .select("id", head)
        .eq("tenant_id", tenantId!)
        .eq("energy_type", "pv");
      const gasHeatMeterQ = supabase
        .from("meters")
        .select("id", head)
        .eq("tenant_id", tenantId!)
        .in("energy_type", ["gas", "heat", "heating"]);
      const floorsQ = supabase.from("floors").select("id", head).not("floor_plan_url", "is", null);
      const energyPricesQ = supabase.from("energy_prices").select("id", head).eq("tenant_id", tenantId!);
      const dynamicPriceQ = supabase
        .from("energy_prices")
        .select("id", head)
        .eq("tenant_id", tenantId!)
        .eq("is_dynamic", true);
      const integrationErrQ = supabase
        .from("integration_errors")
        .select("id", head)
        .eq("tenant_id", tenantId!)
        .is("resolved_at", null);

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
        loc ? metersQ.eq("location_id", loc) : metersQ,
        loc ? pvSourceQ.eq("location_id", loc) : pvSourceQ,
        loc ? pvMeterQ.eq("location_id", loc) : pvMeterQ,
        loc ? gasHeatMeterQ.eq("location_id", loc) : gasHeatMeterQ,
        loc ? floorsQ.eq("location_id", loc) : floorsQ,
        loc ? energyPricesQ.eq("location_id", loc) : energyPricesQ,
        supabase.from("tenant_electricity_tariffs").select("id", head).eq("tenant_id", tenantId!),
        loc ? dynamicPriceQ.eq("location_id", loc) : dynamicPriceQ,
        supabase.from("arbitrage_strategies").select("id", head).eq("tenant_id", tenantId!).eq("is_active", true),
        supabase.from("ppa_contracts").select("id", head).eq("tenant_id", tenantId!),
        supabase.from("tenant_savings_contracts").select("id", head).eq("tenant_id", tenantId!),
        loc ? integrationErrQ.eq("location_id", loc) : integrationErrQ,
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
