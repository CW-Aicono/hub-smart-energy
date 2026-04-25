import { useEffect, useCallback } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionName } from "@/lib/gatewayRegistry";
import { invokeWithRetry } from "@/lib/invokeWithRetry";

/**
 * Subscribe to realtime updates of gateway_device_inventory and
 * gateway_sensor_snapshots so the UI reflects the latest cached state.
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
        { event: "*", schema: "public", table: "gateway_device_inventory" },
        (payload) => {
          const row: any = (payload.new as any) ?? (payload.old as any);
          const liId = row?.location_integration_id;
          if (!liId || !ids.includes(liId)) return;
          queryClient.invalidateQueries({ queryKey: ["gateway-sensors", liId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gateway_sensor_snapshots" },
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

/**
 * Cache-first sensor fetch.
 * - Default: read the snapshot stored in `gateway_sensor_snapshots` (instant, no
 *   external HTTP, no edge timeouts).
 * - Pass `live: true` to force a `refreshSensors` call which goes live against
 *   the gateway (rate-limited via DB lock) and updates the snapshot.
 */
async function fetchSensors(
  integrationId: string,
  integrationType?: string,
  live = false,
): Promise<GatewaySensor[]> {
  const edgeFunction = integrationType ? getEdgeFunctionName(integrationType) : "loxone-api";
  // Refresh JWT before invoking – avoids 401 "Ungültiges Token" after idle periods.
  await supabase.auth.getSession();

  const action = live ? "refreshSensors" : "getSensorsCached";

  const { data, error } = await invokeWithRetry(edgeFunction, {
    body: { locationIntegrationId: integrationId, action },
  });

  if (error) {
    if (error.message?.includes("401") || error.message?.includes("Token")) {
      console.warn(`[useLoxoneSensors] Auth error (ignored): ${error.message}`);
      return [];
    }
    throw new Error(error.message || "Failed to fetch sensors");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Failed to fetch sensors");
  }

  return (data.sensors ?? []) as GatewaySensor[];
}

export function useLoxoneSensors(integrationId: string | undefined, integrationType?: string) {
  const queryClient = useQueryClient();
  useGatewayInventoryRealtime(integrationId ? [integrationId] : []);

  const query = useQuery<GatewaySensor[]>({
    queryKey: ["gateway-sensors", integrationId],
    queryFn: () => fetchSensors(integrationId!, integrationType, false),
    enabled: !!integrationId,
    staleTime: 10_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // Cache-only polling: cheap DB read, no live gateway hit.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const refresh = useCallback(async () => {
    if (!integrationId) return;
    try {
      const fresh = await fetchSensors(integrationId, integrationType, true);
      queryClient.setQueryData(["gateway-sensors", integrationId], fresh);
    } catch (err) {
      console.warn("[useLoxoneSensors] refresh failed:", err);
      // Trigger a cached re-read so the UI still updates if the snapshot moved.
      queryClient.invalidateQueries({ queryKey: ["gateway-sensors", integrationId] });
    }
  }, [integrationId, integrationType, queryClient]);

  return { ...query, refresh };
}

export function useLoxoneSensorsMulti(integrationIds: string[], integrationTypes?: (string | undefined)[]) {
  useGatewayInventoryRealtime(integrationIds);
  return useQueries({
    queries: integrationIds.map((id, idx) => ({
      queryKey: ["gateway-sensors", id],
      queryFn: () => fetchSensors(id, integrationTypes?.[idx], false),
      staleTime: 10_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      enabled: !!id,
    })),
  });
}
