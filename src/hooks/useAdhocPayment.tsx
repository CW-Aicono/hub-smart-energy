import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTenant } from "@/hooks/useTenant";

/** ============ Providers ============ */
export function useAdhocProviders() {
  const { tenant } = useTenant();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["adhoc-providers", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_providers")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: Partial<any> & { id?: string }) => {
      const row = { ...payload, tenant_id: tenant!.id };
      const { data, error } = payload.id
        ? await supabase.from("payment_providers").update(row as any).eq("id", payload.id).select().single()
        : await supabase.from("payment_providers").insert(row as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adhoc-providers", tenant?.id] });
      toast({ title: "Gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_providers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adhoc-providers", tenant?.id] }),
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { ...query, upsert, remove };
}

/** ============ Terminals ============ */
export function useAdhocTerminals() {
  const { tenant } = useTenant();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["adhoc-terminals", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_terminals")
        .select("*, provider:payment_providers(display_name, provider_type, environment), assignments:charge_point_terminals(id, charge_point_id, connector_id, is_primary, charge_points(name, ocpp_id))")
        .eq("tenant_id", tenant!.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: Partial<any> & { id?: string }) => {
      const { assignments, provider, charge_points, ...clean } = payload as any;
      const row = { ...clean, tenant_id: tenant!.id };
      const { data, error } = payload.id
        ? await supabase.from("payment_terminals").update(row as any).eq("id", payload.id).select().single()
        : await supabase.from("payment_terminals").insert(row as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adhoc-terminals", tenant?.id] });
      toast({ title: "Terminal gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_terminals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adhoc-terminals", tenant?.id] }),
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const assignChargePoint = useMutation({
    mutationFn: async (args: { terminal_id: string; charge_point_id: string; connector_id?: number | null; is_primary?: boolean }) => {
      const { error } = await supabase.from("charge_point_terminals").insert({
        tenant_id: tenant!.id,
        terminal_id: args.terminal_id,
        charge_point_id: args.charge_point_id,
        connector_id: args.connector_id ?? null,
        is_primary: args.is_primary ?? false,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adhoc-terminals", tenant?.id] });
      toast({ title: "Ladepunkt zugeordnet" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const unassignChargePoint = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("charge_point_terminals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adhoc-terminals", tenant?.id] }),
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { ...query, upsert, remove, assignChargePoint, unassignChargePoint };
}

/** ============ Payment Rules ============ */
export function useAdhocRules() {
  const { tenant } = useTenant();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["adhoc-rules", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("adhoc_payment_rules")
        .select("*, tariff:charging_tariffs(name, price_per_kwh, currency)")
        .eq("tenant_id", tenant!.id)
        .order("scope")
        .order("priority", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: Partial<any> & { id?: string }) => {
      const { tariff, ...clean } = payload as any;
      const row = { ...clean, tenant_id: tenant!.id };
      const { data, error } = payload.id
        ? await supabase.from("adhoc_payment_rules").update(row as any).eq("id", payload.id).select().single()
        : await supabase.from("adhoc_payment_rules").insert(row as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adhoc-rules", tenant?.id] });
      toast({ title: "Regel gespeichert" });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      const friendly = msg.includes("idx_adhoc_rules_tenant_unique")
        ? "Es existiert bereits eine Basis-Regel für diesen Mandanten. Bitte bestehende Regel bearbeiten oder als Geltungsbereich Ladepunkt-Gruppe oder einzelnen Ladepunkt wählen."
        : msg;
      toast({ title: "Fehler", description: friendly, variant: "destructive" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("adhoc_payment_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adhoc-rules", tenant?.id] }),
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { ...query, upsert, remove };
}

/** ============ Sessions / Transactions ============ */
export function useAdhocSessions(filters?: { state?: string; from?: string; to?: string; chargePointId?: string }) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["adhoc-sessions", tenant?.id, filters],
    enabled: !!tenant?.id,
    queryFn: async () => {
      let q = supabase
        .from("adhoc_payment_sessions")
        .select("*, terminal:payment_terminals(terminal_serial, terminal_model), charge_point:charge_points(name, ocpp_id, location_id), provider:payment_providers(display_name, provider_type)")
        .eq("tenant_id", tenant!.id)
        .order("started_at", { ascending: false })
        .limit(500);
      if (filters?.state) q = q.eq("state", filters.state as any);
      if (filters?.from) q = q.gte("started_at", filters.from);
      if (filters?.to) q = q.lte("started_at", filters.to);
      if (filters?.chargePointId) q = q.eq("charge_point_id", filters.chargePointId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useAdhocSessionEvents(sessionId: string | null) {
  return useQuery({
    queryKey: ["adhoc-events", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_events")
        .select("*")
        .eq("session_id", sessionId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}
