import { useQuery, useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionName } from "@/lib/gatewayRegistry";

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
  return useQuery<GatewaySensor[]>({
    queryKey: ["gateway-sensors", integrationId],
    queryFn: () => fetchSensors(integrationId!, integrationType),
    enabled: !!integrationId,
    staleTime: 60_000,
    // Background safety net – realtime invalidation handles instant updates.
    refetchInterval: 5 * 60_000,
  });
}

export function useLoxoneSensorsMulti(integrationIds: string[], integrationTypes?: (string | undefined)[]) {
  return useQueries({
    queries: integrationIds.map((id, idx) => ({
      queryKey: ["gateway-sensors", id],
      queryFn: () => fetchSensors(id, integrationTypes?.[idx]),
      staleTime: 60_000,
      refetchInterval: 5 * 60_000,
      enabled: !!id,
    })),
  });
}
