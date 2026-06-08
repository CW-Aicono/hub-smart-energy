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
