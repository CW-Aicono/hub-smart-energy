import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "@/hooks/use-toast";

export interface GridOperatorConnection {
  id: string;
  tenant_id: string;
  location_id: string;
  module: "modul1" | "modul2" | "modul3";
  dso_name: string;
  connection_id: string | null;
  webhook_secret: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CurtailmentEvent {
  id: string;
  tenant_id: string;
  connection_id: string;
  received_at: string;
  valid_from: string;
  valid_until: string;
  curtailment_percent: number;
  source: "webhook" | "manual" | "cron";
  payload: any;
  applied_at: string | null;
  applied_result: any;
}

export interface SteuveDevice {
  id: string;
  tenant_id: string;
  connection_id: string;
  device_type: "charge_point" | "heat_pump" | "battery";
  device_ref_id: string;
  min_power_kw: number;
  priority: number;
  active: boolean;
}

export function useGridConnection(locationId: string) {
  const { tenant } = useTenant();
  const qc = useQueryClient();

  const connectionQuery = useQuery({
    queryKey: ["grid-connection", tenant?.id, locationId],
    enabled: !!tenant?.id && !!locationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grid_operator_connections")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("location_id", locationId)
        .maybeSingle();
      if (error) throw error;
      return (data as GridOperatorConnection | null) ?? null;
    },
  });

  const connection = connectionQuery.data ?? null;

  const eventsQuery = useQuery({
    queryKey: ["grid-curtailment-events", connection?.id],
    enabled: !!connection?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grid_curtailment_events")
        .select("*")
        .eq("connection_id", connection!.id)
        .order("received_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as CurtailmentEvent[];
    },
  });

  const devicesQuery = useQuery({
    queryKey: ["grid-steuve-devices", connection?.id],
    enabled: !!connection?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("steuve_devices")
        .select("*")
        .eq("connection_id", connection!.id)
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SteuveDevice[];
    },
  });

  const saveConnection = useMutation({
    mutationFn: async (input: Partial<GridOperatorConnection> & { dso_name: string }) => {
      if (!tenant?.id) throw new Error("Kein Tenant");
      const payload = {
        tenant_id: tenant.id,
        location_id: locationId,
        module: input.module ?? "modul1",
        dso_name: input.dso_name,
        connection_id: input.connection_id ?? null,
        active: input.active ?? true,
        notes: input.notes ?? null,
        ...(input.id ? { id: input.id } : {}),
      };
      const { error } = await supabase
        .from("grid_operator_connections")
        .upsert(payload, { onConflict: "location_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grid-connection", tenant?.id, locationId] });
      toast({ title: "Netzbetreiber-Anbindung gespeichert" });
    },
    onError: (e: any) => toast({ title: "Speichern fehlgeschlagen", description: e.message, variant: "destructive" }),
  });

  const removeConnection = useMutation({
    mutationFn: async () => {
      if (!connection?.id) return;
      const { error } = await supabase.from("grid_operator_connections").delete().eq("id", connection.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grid-connection", tenant?.id, locationId] });
      toast({ title: "Anbindung entfernt" });
    },
  });

  const upsertDevice = useMutation({
    mutationFn: async (input: Partial<SteuveDevice> & { device_ref_id: string; device_type: SteuveDevice["device_type"] }) => {
      if (!tenant?.id || !connection?.id) throw new Error("Keine Connection");
      const payload = {
        tenant_id: tenant.id,
        connection_id: connection.id,
        device_type: input.device_type,
        device_ref_id: input.device_ref_id,
        min_power_kw: input.min_power_kw ?? 4.2,
        priority: input.priority ?? 100,
        active: input.active ?? true,
      };
      const { error } = await supabase
        .from("steuve_devices")
        .upsert(payload, { onConflict: "connection_id,device_type,device_ref_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grid-steuve-devices", connection?.id] }),
  });

  const deleteDevice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("steuve_devices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grid-steuve-devices", connection?.id] }),
  });

  const triggerManualEvent = useMutation({
    mutationFn: async (input: { curtailment_percent: number; duration_min: number }) => {
      if (!tenant?.id || !connection?.id) throw new Error("Keine Connection");
      const now = new Date();
      const until = new Date(now.getTime() + input.duration_min * 60 * 1000);
      const { data: ev, error } = await supabase
        .from("grid_curtailment_events")
        .insert({
          tenant_id: tenant.id,
          connection_id: connection.id,
          valid_from: now.toISOString(),
          valid_until: until.toISOString(),
          curtailment_percent: input.curtailment_percent,
          source: "manual",
          payload: { triggered_by: "ui" },
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: applyErr } = await supabase.functions.invoke("grid-curtailment-apply", {
        body: { event_id: ev.id },
      });
      if (applyErr) throw applyErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grid-curtailment-events", connection?.id] });
      toast({ title: "Manuelle Drosselung ausgelöst" });
    },
    onError: (e: any) => toast({ title: "Auslösen fehlgeschlagen", description: e.message, variant: "destructive" }),
  });

  const activeEvent = useMemo(() => {
    const list = eventsQuery.data ?? [];
    const now = Date.now();
    return (
      list.find((e) => new Date(e.valid_from).getTime() <= now && new Date(e.valid_until).getTime() > now) ?? null
    );
  }, [eventsQuery.data]);

  return {
    connection,
    events: eventsQuery.data ?? [],
    devices: devicesQuery.data ?? [],
    activeEvent,
    isLoading: connectionQuery.isLoading,
    saveConnection,
    removeConnection,
    upsertDevice,
    deleteDevice,
    triggerManualEvent,
  };
}
