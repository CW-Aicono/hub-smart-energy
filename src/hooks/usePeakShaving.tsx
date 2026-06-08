import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";
import { useEffect } from "react";

export interface PeakShavingConfig {
  id: string;
  tenant_id: string;
  location_id: string;
  storage_id: string;
  peak_limit_kw: number;
  reserve_soc_pct: number;
  mode: "threshold" | "forecast" | "event";
  network_tariff_eur_per_kw_year: number;
  billing_cycle: "monthly" | "yearly";
  hysteresis_pct: number;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PeakShavingEvent {
  id: string;
  config_id: string;
  tenant_id: string;
  started_at: string;
  ended_at: string | null;
  peak_kw_without_shaving: number | null;
  peak_kw_actual: number | null;
  kwh_discharged: number;
  eur_saved: number;
  trigger_reason: string | null;
  metadata: Record<string, unknown>;
}

export interface PeakShavingMonthly {
  id: string;
  config_id: string;
  tenant_id: string;
  year: number;
  month: number;
  max_peak_kw: number;
  baseline_peak_kw: number;
  total_kwh_discharged: number;
  total_eur_saved: number;
  event_count: number;
}

export function usePeakShavingConfigs() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["peak-shaving-configs", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peak_shaving_configs")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PeakShavingConfig[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: Partial<PeakShavingConfig> & { id?: string }) => {
      if (values.id) {
        const { id, ...rest } = values;
        const { error } = await supabase.from("peak_shaving_configs").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("peak_shaving_configs").insert({ ...values, tenant_id: tenantId! } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peak-shaving-configs", tenantId] });
      toast({ title: "Konfiguration gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("peak_shaving_configs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peak-shaving-configs", tenantId] });
      toast({ title: "Konfiguration gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { configs, isLoading, upsert, remove };
}

export function usePeakShavingEvents(limit = 50) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const query = useQuery({
    queryKey: ["peak-shaving-events", tenantId, limit],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peak_shaving_events")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as PeakShavingEvent[];
    },
    refetchInterval: 30_000,
  });

  // Realtime invalidation
  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel(`peak_shaving_events_${tenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "peak_shaving_events", filter: `tenant_id=eq.${tenantId}` },
        () => qc.invalidateQueries({ queryKey: ["peak-shaving-events", tenantId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tenantId, qc]);

  return query;
}

export function usePeakShavingMonthly() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  return useQuery({
    queryKey: ["peak-shaving-monthly", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peak_shaving_monthly_summary")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return data as PeakShavingMonthly[];
    },
  });
}

export interface PeakShavingCalendarEvent {
  id: string;
  config_id: string;
  tenant_id: string;
  event_name: string;
  start_at: string;
  end_at: string;
  expected_peak_kw: number | null;
  pre_charge_target_soc_pct: number;
  pre_charge_lead_hours: number;
  pre_charge_started_at: string | null;
  pre_charge_completed_at: string | null;
  status: "planned" | "pre_charging" | "active" | "completed" | "cancelled";
  notes: string | null;
}

export interface PeakShavingDispatch {
  id: string;
  config_id: string;
  storage_id: string;
  action: "discharge" | "charge" | "release";
  target_power_kw: number;
  reason: string | null;
  success: boolean | null;
  error_message: string | null;
  created_at: string;
}

export function usePeakShavingCalendar() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["peak-shaving-calendar", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peak_shaving_event_calendar")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return data as PeakShavingCalendarEvent[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (values: Partial<PeakShavingCalendarEvent> & { id?: string }) => {
      if (values.id) {
        const { id, ...rest } = values;
        const { error } = await supabase.from("peak_shaving_event_calendar").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("peak_shaving_event_calendar")
          .insert({ ...values, tenant_id: tenantId! } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peak-shaving-calendar", tenantId] });
      toast({ title: "Event gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("peak_shaving_event_calendar").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peak-shaving-calendar", tenantId] });
      toast({ title: "Event gelöscht" });
    },
  });

  return { items, isLoading, upsert, remove };
}

export function usePeakShavingDispatches(limit = 50) {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  return useQuery({
    queryKey: ["peak-shaving-dispatches", tenantId, limit],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peak_shaving_dispatch_log")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as PeakShavingDispatch[];
    },
    refetchInterval: 30_000,
  });
}

export async function downloadPeakShavingReport(configId: string, year: number, month: number) {
  const { data, error } = await supabase.functions.invoke("peak-shaving-report", {
    body: { mode: "ondemand", config_id: configId, year, month },
  });
  if (error) throw error;
  const { pdf_base64, filename } = data as { pdf_base64: string; filename: string };
  const blob = new Blob([Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0))], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
