import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "sonner";
import { useTranslation } from "./useTranslation";

export interface GatewayDevice {
  id: string;
  tenant_id: string;
  location_integration_id: string | null;
  device_name: string;
  device_type: string;
  local_ip: string | null;
  ha_version: string | null;
  addon_version: string | null;
  latest_available_version: string | null;
  last_heartbeat_at: string | null;
  local_time: string | null;
  status: string;
  config: Record<string, unknown>;
  offline_buffer_count: number;
  api_key_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface GatewayDeviceWithMetrics extends GatewayDevice {
  automationCount: number;
  activeAutomationCount: number;
  lastExecutionAt: string | null;
}

export function useGatewayDevices(locationIntegrationId?: string) {
  const { tenant } = useTenant();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["gateway-devices", tenant?.id, locationIntegrationId],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<GatewayDeviceWithMetrics[]> => {
      // Fetch devices
      let q = supabase
        .from("gateway_devices")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("device_name");

      if (locationIntegrationId) {
        q = q.eq("location_integration_id", locationIntegrationId);
      }

      const { data, error } = await q;
      if (error) throw error;

      const devices = (data || []).map((d: any) => {
        const lastHeartbeat = d.last_heartbeat_at ? new Date(d.last_heartbeat_at).getTime() : 0;
        const isStale = Date.now() - lastHeartbeat > 3 * 60 * 1000;
        return {
          ...d,
          status: isStale && d.status === "online" ? "offline" : d.status,
        } as GatewayDevice;
      });

      if (devices.length === 0) return [];

      // Fetch automation counts per location_integration_id
      const integrationIds = devices
        .map((d) => d.location_integration_id)
        .filter((id): id is string => !!id);

      let automationMap: Record<string, { total: number; active: number; lastExec: string | null }> = {};

      if (integrationIds.length > 0) {
        const { data: automations } = await supabase
          .from("location_automations")
          .select("location_integration_id, is_active, last_executed_at")
          .in("location_integration_id", integrationIds);

        if (automations) {
          for (const a of automations) {
            const key = a.location_integration_id;
            if (!automationMap[key]) {
              automationMap[key] = { total: 0, active: 0, lastExec: null };
            }
            automationMap[key].total++;
            if (a.is_active) automationMap[key].active++;
            if (a.last_executed_at && (!automationMap[key].lastExec || a.last_executed_at > automationMap[key].lastExec!)) {
              automationMap[key].lastExec = a.last_executed_at;
            }
          }
        }
      }

      return devices.map((d): GatewayDeviceWithMetrics => {
        const stats = d.location_integration_id ? automationMap[d.location_integration_id] : undefined;
        return {
          ...d,
          automationCount: stats?.total ?? 0,
          activeAutomationCount: stats?.active ?? 0,
          lastExecutionAt: stats?.lastExec ?? null,
        };
      });
    },
  });

  const sendCommand = useMutation({
    mutationFn: async ({ deviceId, command }: { deviceId: string; command: string }) => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/gateway-ingest?action=gateway-command`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ device_id: deviceId, command }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    },
    onSuccess: () => {
      toast.success(t("gatewayDevices.commandSent" as any));
      queryClient.invalidateQueries({ queryKey: ["gateway-devices"] });
    },
    onError: () => {
      toast.error(t("gatewayDevices.commandFailed" as any));
    },
  });

  return {
    devices: query.data ?? [],
    isLoading: query.isLoading,
    sendCommand: sendCommand.mutate,
    refetch: query.refetch,
  };
}
