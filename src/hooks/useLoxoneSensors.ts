import { useEffect } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionName } from "@/lib/gatewayRegistry";

/**
 * Subscribe to realtime updates of gateway_device_inventory for the given
 * location_integration_ids. Whenever a row changes (e.g. an actuator is
 * toggled locally on the device or via HA), invalidate the matching
 * "gateway-sensors" query so the UI reflects the new state immediately.
 */
function useGatewayInventoryRealtime(integrationIds: string[]) {
  const queryClient = useQueryClient();
  const key = integrationIds.filter(Boolean).slice().sort().join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) return;

    const channel = supabase
      .channel(`gw-inventory-${key}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gateway_device_inventory",
        },
        (payload) => {
          const row: any = (payload.new as any) ?? (payload.old as any);
          const liId = row?.location_integration_id;
          if (!liId || !ids.includes(liId)) return;
          queryClient.invalidateQueries({ queryKey: ["gateway-sensors", liId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export interface GatewaySensor {
  id: string;
  name: string;
  type: string;
  controlType: string;
  room: string;
  category: string;
  value: string;
  rawValue: number | null;
  unit: string;
  status: string;
  stateName: string;
  secondaryValue: string;
  secondaryStateName: string;
  secondaryUnit: string;
  totalDay: number | null;
  totalWeek: number | null;
  totalMonth: number | null;
  totalYear: number | null;
}

// Re-export as LoxoneSensor for backwards-compat
export type LoxoneSensor = GatewaySensor;

async function fetchSensors(integrationId: string, integrationType?: string): Promise<GatewaySensor[]> {
  const edgeFunction = integrationType ? getEdgeFunctionName(integrationType) : "loxone-api";
  // Refresh JWT before invoking – avoids 401 "Ungültiges Token" after idle periods.
  await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke(edgeFunction, {
    body: { locationIntegrationId: integrationId, action: "getSensors" },
  });
  if (error) {
    // Silently ignore auth errors – Realtime + DB cache keep UI fresh.
    if (error.message?.includes("401") || error.message?.includes("Token")) {
      console.warn(`[useLoxoneSensors] Auth error (ignored): ${error.message}`);
      return [];
    }
    throw new Error(error.message || "Failed to fetch sensors");
  }
  if (!data?.success) throw new Error(data?.error || "Failed to fetch sensors");
  return data.sensors as GatewaySensor[];
}

export function useLoxoneSensors(integrationId: string | undefined, integrationType?: string) {
  useGatewayInventoryRealtime(integrationId ? [integrationId] : []);
  return useQuery<GatewaySensor[]>({
    queryKey: ["gateway-sensors", integrationId],
    queryFn: () => fetchSensors(integrationId!, integrationType),
    enabled: !!integrationId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: true,
    // Short polling fallback for setups where DB realtime invalidation is delayed
    // or unavailable, so actuator states don't stay stale in the UI.
    refetchInterval: 15_000,
  });
}

export function useLoxoneSensorsMulti(integrationIds: string[], integrationTypes?: (string | undefined)[]) {
  useGatewayInventoryRealtime(integrationIds);
  return useQueries({
    queries: integrationIds.map((id, idx) => ({
      queryKey: ["gateway-sensors", id],
      queryFn: () => fetchSensors(id, integrationTypes?.[idx]),
      staleTime: 0,
      refetchOnMount: "always" as const,
      refetchOnWindowFocus: true,
      refetchIntervalInBackground: true,
      refetchInterval: 15_000,
      enabled: !!id,
    })),
  });
}
