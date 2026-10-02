import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTenant } from "@/hooks/useTenant";

export interface RoamingSettings {
  id: string;
  tenant_id: string;
  enabled: boolean;
  role: "CPO" | "EMSP" | "HUB";
  protocol: "OCPI" | "HUBJECT" | "OTHER";
  country_code: string | null;
  party_id: string | null;
  our_token: string | null;
  default_guest_tariff_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoamingPartner {
  id: string;
  tenant_id: string;
  name: string;
  role: "CPO" | "EMSP" | "HUB";
  protocol: "OCPI" | "HUBJECT" | "OTHER";
  country_code: string | null;
  party_id: string | null;
  endpoint_url: string | null;
  token: string | null;
  status: "pending" | "active" | "inactive" | "error";
  last_sync_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoamingSession {
  id: string;
  tenant_id: string;
  partner_id: string | null;
  direction: "inbound" | "outbound";
  external_session_id: string | null;
  charge_point_id: string | null;
  external_user_ref: string | null;
  started_at: string | null;
  ended_at: string | null;
  energy_kwh: number;
  cost_amount: number;
  currency: string;
  status: "pending" | "active" | "completed" | "failed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export function useRoamingSettings() {
  const qc = useQueryClient();
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  const query = useQuery({
    queryKey: ["roaming-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roaming_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return (data as RoamingSettings | null) ?? null;
    },
  });

  const upsert = useMutation({
    mutationFn: async (patch: Partial<RoamingSettings>) => {
      if (!tenantId) throw new Error("Kein Mandant geladen");
      const existing = query.data;
      if (existing) {
        const { error } = await supabase
          .from("roaming_settings")
          .update(patch)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("roaming_settings")
          .insert({ tenant_id: tenantId, ...patch });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roaming-settings", tenantId] });
      toast({ title: "Roaming-Einstellungen gespeichert" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { settings: query.data ?? null, isLoading: query.isLoading, upsert };
}

export function useRoamingPartners() {
  const qc = useQueryClient();
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  const query = useQuery({
    queryKey: ["roaming-partners", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roaming_partners")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as RoamingPartner[];
    },
  });

  const add = useMutation({
    mutationFn: async (p: Partial<RoamingPartner> & { name: string }) => {
      if (!tenantId) throw new Error("Kein Mandant geladen");
      const { error } = await supabase
        .from("roaming_partners")
        .insert({ tenant_id: tenantId, ...p });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roaming-partners", tenantId] });
      toast({ title: "Roaming-Partner angelegt" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<RoamingPartner> & { id: string }) => {
      const { error } = await supabase.from("roaming_partners").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roaming-partners", tenantId] });
      toast({ title: "Roaming-Partner aktualisiert" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roaming_partners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roaming-partners", tenantId] });
      toast({ title: "Roaming-Partner gelöscht" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const testConnection = useMutation({
    mutationFn: async (partner: RoamingPartner) => {
      // Generic placeholder: mark as active + update last_sync_at.
      // Real OCPI handshake follows later with provider specifics.
      const ok = !!(partner.endpoint_url && partner.token && partner.party_id);
      const { error } = await supabase
        .from("roaming_partners")
        .update({
          status: ok ? "active" : "error",
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", partner.id);
      if (error) throw error;
      return ok;
    },
    onSuccess: (ok) => {
      qc.invalidateQueries({ queryKey: ["roaming-partners", tenantId] });
      toast({
        title: ok ? "Verbindung erfolgreich" : "Verbindung fehlgeschlagen",
        description: ok
          ? "Partner ist als aktiv markiert."
          : "Endpunkt, Token und Party-ID müssen gesetzt sein.",
        variant: ok ? "default" : "destructive",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { partners: query.data ?? [], isLoading: query.isLoading, add, update, remove, testConnection };
}

export function useRoamingSessions() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  const query = useQuery({
    queryKey: ["roaming-sessions", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roaming_sessions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("started_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as RoamingSession[];
    },
  });

  return { sessions: query.data ?? [], isLoading: query.isLoading };
}
