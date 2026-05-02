import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "@/hooks/use-toast";

export interface PublicStatusLink {
  id: string;
  tenant_id: string;
  token: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

function generateToken(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const arr = new Uint32Array(32);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < 32; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

export function buildPublicStatusUrl(token: string): string {
  return `${window.location.origin}/public/charge-status/${token}`;
}

export function useTenantPublicStatusLink() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id ?? null;

  const query = useQuery({
    queryKey: ["public-charge-status-link", tenantId],
    queryFn: async (): Promise<PublicStatusLink | null> => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("public_charge_status_links")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return (data as PublicStatusLink) ?? null;
    },
    enabled: !!tenantId,
  });

  const ensureLink = useMutation({
    mutationFn: async (): Promise<PublicStatusLink> => {
      if (!tenantId) throw new Error("Kein Tenant geladen");
      const existing = query.data;
      if (existing) {
        if (!existing.enabled) {
          const { data, error } = await supabase
            .from("public_charge_status_links")
            .update({ enabled: true })
            .eq("id", existing.id)
            .select()
            .single();
          if (error) throw error;
          return data as PublicStatusLink;
        }
        return existing;
      }
      const { data, error } = await supabase
        .from("public_charge_status_links")
        .insert({ tenant_id: tenantId, token: generateToken(), enabled: true })
        .select()
        .single();
      if (error) throw error;
      return data as PublicStatusLink;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-charge-status-link", tenantId] });
      toast({ title: "Öffentlicher Link aktiviert" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const disableLink = useMutation({
    mutationFn: async () => {
      if (!query.data) return;
      const { error } = await supabase
        .from("public_charge_status_links")
        .update({ enabled: false })
        .eq("id", query.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-charge-status-link", tenantId] });
      toast({ title: "Öffentlicher Link deaktiviert" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const regenerateToken = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error("Kein Link vorhanden");
      const { error } = await supabase
        .from("public_charge_status_links")
        .update({ token: generateToken() })
        .eq("id", query.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-charge-status-link", tenantId] });
      toast({ title: "Neuer Token erzeugt" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  return {
    link: query.data ?? null,
    isLoading: query.isLoading,
    ensureLink,
    disableLink,
    regenerateToken,
  };
}
