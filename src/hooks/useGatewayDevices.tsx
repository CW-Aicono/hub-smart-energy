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
  status: string;
  config: Record<string, unknown>;
  offline_buffer_count: number;
  created_at: string;
  updated_at: string;
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
    queryFn: async (): Promise<GatewayDevice[]> => {
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

      // Mark devices as offline if heartbeat is stale (>3 minutes)
      return (data || []).map((d: any) => {
        const lastHeartbeat = d.last_heartbeat_at ? new Date(d.last_heartbeat_at).getTime() : 0;
        const isStale = Date.now() - lastHeartbeat > 3 * 60 * 1000;
        return {
          ...d,
          status: isStale && d.status === "online" ? "offline" : d.status,
        } as GatewayDevice;
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
      const data = await res.json();
      return data;
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
