import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { getT } from "@/i18n/getT";
import { downloadSecureStorageObject } from "@/lib/secureStorage";

export interface ChargePointAccessSettings {
  free_charging: boolean;
  user_group_restriction: boolean;
  max_charging_duration_min: number;
}

export interface ChargePointPowerLimitSchedule {
  enabled: boolean;
  mode: "allday" | "window";
  time_from: string;
  time_to: string;
  limit_type: "kw" | "minimal";
  limit_kw: number | null;
}

export interface ChargePointCheapChargingConfig {
  enabled: boolean;
  max_price_eur_mwh: number;
  limit_kw: number;
  use_fallback_window: boolean;
  fallback_time_from: string;
  fallback_time_to: string;
}

export interface ChargePointEnergySettings {
  dynamic_load_management: boolean;
  pv_surplus_charging: boolean;
  cheap_charging_mode: boolean;
  cheap_charging?: ChargePointCheapChargingConfig;
}

export interface ChargePoint {
  id: string;
  tenant_id: string;
  location_id: string | null;
  group_id: string | null;
  ocpp_id: string | null;
  ocpp_password: string | null;
  name: string;
  status: string;
  connector_count: number;
  max_power_kw: number;
  connector_type: string;
  last_heartbeat: string | null;
  firmware_version: string | null;
  vendor: string | null;
  model: string | null;
  photo_url: string | null;
  photo_storage_path?: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  access_settings: ChargePointAccessSettings;
  energy_settings: ChargePointEnergySettings;
  power_limit_schedule: ChargePointPowerLimitSchedule | null;
  supports_charging_profile: boolean | null;
  supports_change_configuration: boolean | null;
  rfid_read_mode: "raw" | "byte_reversed" | "nibble_swap" | "byte_reversed_nibble_swap";
  ws_connected: boolean;
  ws_connected_since: string | null;
  created_at: string;
  updated_at: string;
}

export function useChargePoints() {
  const queryClient = useQueryClient();

  const resolvePhotoUrl = async (photoUrl: string | null) => {
    if (!photoUrl || /^https?:\/\//i.test(photoUrl)) {
      return { displayUrl: photoUrl, storagePath: null };
    }

    const displayUrl = await downloadSecureStorageObject("meter-photos", photoUrl);
    return { displayUrl: displayUrl || photoUrl, storagePath: photoUrl };
  };

  const { data: chargePoints = [], isLoading } = useQuery({
    queryKey: ["charge-points"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_points")
        .select("*")
        .order("name");
      if (error) throw error;
      const rows = (data ?? []) as unknown as ChargePoint[];
      return Promise.all(rows.map(async (cp) => {
        const resolved = await resolvePhotoUrl(cp.photo_url);
        return { ...cp, photo_url: resolved.displayUrl, photo_storage_path: resolved.storagePath };
      }));
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("charge-points-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "charge_points" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["charge-points"] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const addChargePoint = useMutation({
    mutationFn: async (cp: Partial<ChargePoint> & { tenant_id: string; ocpp_id?: string | null; name: string }) => {
      const { data, error } = await supabase.from("charge_points").insert(cp as any).select().single();
      if (error) throw error;

      // Seed charge_point_connectors so the connector cards / status grid appear immediately.
      // Without this, freshly created charge points show "Anschlüsse: N" in the details panel
      // but have no rows in charge_point_connectors, so the connector UI stays empty until
      // the user edits the CP (which triggers the sync logic in updateChargePoint).
      const count = Math.max(1, Number((cp as any).connector_count ?? 1));
      const connectorType = (cp as any).connector_type ?? "Type2";
      const maxPower = Number((cp as any).max_power_kw ?? 22);
      const inserts = Array.from({ length: count }, (_, i) => ({
        charge_point_id: (data as any).id,
        connector_id: i + 1,
        display_order: i,
        status: "unconfigured",
        connector_type: connectorType,
        max_power_kw: maxPower,
      }));
      const { error: connErr } = await supabase.from("charge_point_connectors").insert(inserts as any);
      if (connErr) console.error("Failed to seed charge_point_connectors:", connErr);

      return data;
    },
    onSuccess: () => {
      const t = getT();
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      queryClient.invalidateQueries({ queryKey: ["charge-point-connectors"] });
      toast({ title: t("chargePoint.created") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const updateChargePoint = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ChargePoint> & { id: string }) => {
      const { error } = await supabase.from("charge_points").update(updates as any).eq("id", id);
      if (error) throw error;

      // Sync charge_point_connectors when count or type changed
      const targetCount = typeof updates.connector_count === "number" ? updates.connector_count : undefined;
      const targetType = typeof updates.connector_type === "string" ? updates.connector_type : undefined;
      const targetMaxPower = typeof updates.max_power_kw === "number" ? updates.max_power_kw : undefined;

      if (targetCount !== undefined || targetType !== undefined || targetMaxPower !== undefined) {
        const { data: existing } = await supabase
          .from("charge_point_connectors")
          .select("id, connector_id")
          .eq("charge_point_id", id)
          .order("connector_id");

        const existingRows = (existing ?? []) as Array<{ id: string; connector_id: number }>;

        // 1) Update type/power on all existing rows if those fields changed
        if (targetType !== undefined || targetMaxPower !== undefined) {
          const patch: Record<string, unknown> = {};
          if (targetType !== undefined) patch.connector_type = targetType;
          if (targetMaxPower !== undefined) patch.max_power_kw = targetMaxPower;
          if (Object.keys(patch).length > 0) {
            await supabase.from("charge_point_connectors").update(patch as any).eq("charge_point_id", id);
          }
        }

        // 2) Add/remove rows when count changed
        if (targetCount !== undefined) {
          const currentIds = existingRows.map((r) => r.connector_id);
          const desiredIds = Array.from({ length: targetCount }, (_, i) => i + 1);

          const toAdd = desiredIds.filter((i) => !currentIds.includes(i));
          const toRemove = existingRows.filter((r) => !desiredIds.includes(r.connector_id)).map((r) => r.id);

          if (toRemove.length > 0) {
            await supabase.from("charge_point_connectors").delete().in("id", toRemove);
          }
          if (toAdd.length > 0) {
            const inserts = toAdd.map((connector_id) => ({
              charge_point_id: id,
              connector_id,
              display_order: connector_id - 1,
              status: "unconfigured",
              connector_type: targetType ?? "Type2",
              max_power_kw: targetMaxPower ?? 22,
            }));
            await supabase.from("charge_point_connectors").insert(inserts as any);
          }
        }

        queryClient.invalidateQueries({ queryKey: ["charge-point-connectors", id] });
      }
    },
    onSuccess: () => {
      const t = getT();
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      toast({ title: t("chargePoint.updated") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const deleteChargePoint = useMutation({
    mutationFn: async (id: string) => {
      // Find ocpp_id to delete logs
      const cp = queryClient.getQueryData<ChargePoint[]>(["charge-points"])?.find(c => c.id === id);
      if (cp && cp.ocpp_id) {
        await supabase.from("ocpp_message_log").delete().eq("charge_point_id", cp.ocpp_id);
      }
      // Delete charging invoices linked to sessions of this charge point
      const { data: sessionIds } = await supabase.from("charging_sessions").select("id").eq("charge_point_id", id);
      if (sessionIds && sessionIds.length > 0) {
        await supabase.from("charging_invoices").delete().in("session_id", sessionIds.map(s => s.id));
      }
      const { error } = await supabase.from("charge_points").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      const t = getT();
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      toast({ title: t("chargePoint.deleted") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  return { chargePoints, isLoading, addChargePoint, updateChargePoint, deleteChargePoint };
}
