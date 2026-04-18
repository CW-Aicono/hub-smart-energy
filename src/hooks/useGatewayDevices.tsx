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

export function useGatewayDevices(locationIntegrationId?: string, locationId?: string) {
  const { tenant } = useTenant();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["gateway-devices", tenant?.id, locationIntegrationId, locationId],
    enabled: !!tenant?.id,
    staleTime: 60_000,
    // Real-time invalidation handles instant updates; 5-min poll is the fallback.
    refetchInterval: 5 * 60_000,
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

      // Fetch automation counts – devices may lack location_integration_id,
      // so we also resolve via location_integrations → location_id to find
      // sibling integrations that hold the automations.
      const integrationIds = devices
        .map((d) => d.location_integration_id)
        .filter((id): id is string => !!id);

      // Build a map: device.id → list of relevant location_integration_ids
      // For devices WITH a location_integration_id, also find the location_id
      // so we can include automations from sibling integrations.
      let deviceToIntegrationIds: Record<string, string[]> = {};
      let allRelevantIntegrationIds = new Set<string>(integrationIds);

      // Find location_ids for all devices (via their integration or directly)
      if (integrationIds.length > 0) {
        const { data: liRows } = await supabase
          .from("location_integrations")
          .select("id, location_id")
          .in("id", integrationIds);

        if (liRows) {
          const locationIds = [...new Set(liRows.map((r) => r.location_id))];
          // Find ALL integration IDs for these locations
          if (locationIds.length > 0) {
            const { data: siblingLis } = await supabase
              .from("location_integrations")
              .select("id, location_id")
              .in("location_id", locationIds);
            if (siblingLis) {
              for (const sli of siblingLis) {
                allRelevantIntegrationIds.add(sli.id);
              }
              // Map each device to all integrations of its location
              for (const d of devices) {
                const devLi = liRows.find((r) => r.id === d.location_integration_id);
                if (devLi) {
                  deviceToIntegrationIds[d.id] = siblingLis
                    .filter((s) => s.location_id === devLi.location_id)
                    .map((s) => s.id);
                }
              }
            }
          }
        }
      }

      // For devices WITHOUT location_integration_id, resolve only integrations
      // for the current location to avoid tenant-wide overcounting.
      const unlinkedDevices = devices.filter((d) => !d.location_integration_id);
      if (unlinkedDevices.length > 0 && locationId) {
        const { data: locationLis } = await supabase
          .from("location_integrations")
          .select("id, location_id")
          .eq("location_id", locationId)
          .eq("is_enabled", true);
        if (locationLis) {
          for (const d of unlinkedDevices) {
            deviceToIntegrationIds[d.id] = locationLis.map((li) => li.id);
            for (const li of locationLis) allRelevantIntegrationIds.add(li.id);
          }
        }
      }

      let automationMap: Record<string, { total: number; active: number; lastExec: string | null }> = {};

      const relevantIds = [...allRelevantIntegrationIds];
      if (relevantIds.length > 0) {
        const { data: automations } = await supabase
          .from("location_automations")
          .select("location_integration_id, is_active, last_executed_at")
          .in("location_integration_id", relevantIds);

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
        // Aggregate stats across all relevant integration IDs for this device
        const relevantLiIds = deviceToIntegrationIds[d.id]
          ?? (d.location_integration_id ? [d.location_integration_id] : []);
        let total = 0, active = 0, lastExec: string | null = null;
        for (const liId of relevantLiIds) {
          const s = automationMap[liId];
          if (s) {
            total += s.total;
            active += s.active;
            if (s.lastExec && (!lastExec || s.lastExec > lastExec)) lastExec = s.lastExec;
          }
        }
        return {
          ...d,
          automationCount: total,
          activeAutomationCount: active,
          lastExecutionAt: lastExec,
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
      return { ...(await res.json()), _command: command };
    },
    onSuccess: (data) => {
      const cmd = data?._command as string | undefined;
      const msgKey = cmd === "backup" ? "gatewayDevices.backupSent"
        : cmd === "restart" ? "gatewayDevices.restartSent"
        : cmd === "update" ? "gatewayDevices.updateSent"
        : "gatewayDevices.commandSent";
      toast.success(t(msgKey as any));
      queryClient.invalidateQueries({ queryKey: ["gateway-devices"] });
    },
    onError: (error) => {
      toast.error(t("gatewayDevices.commandFailed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  return {
    devices: query.data ?? [],
    isLoading: query.isLoading,
    sendCommand: sendCommand.mutate,
    refetch: query.refetch,
  };
}
