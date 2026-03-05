import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { useAuth } from "./useAuth";
import { toast } from "./use-toast";

export interface LegalPage {
  id: string;
  tenant_id: string;
  page_key: string;
  title: string;
  content_html: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Fetch a legal page by key for the current tenant.
 * Works without auth (public read via RLS).
 */
export function useLegalPage(pageKey: string, tenantId?: string | null) {
  return useQuery({
    queryKey: ["legal-page", tenantId, pageKey],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_pages" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("page_key", pageKey)
        .maybeSingle();
      if (error) throw error;
      return data as LegalPage | null;
    },
  });
}

/**
 * Fetch all legal pages for the current tenant (admin use).
 */
export function useLegalPages() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["legal-pages", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_pages" as any)
        .select("*")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
      return (data as LegalPage[]) ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async ({ pageKey, title, contentHtml }: { pageKey: string; title: string; contentHtml: string }) => {
      if (!tenant?.id || !user?.id) throw new Error("Not authenticated");

      // Check if page exists
      const existing = query.data?.find((p) => p.page_key === pageKey);

      if (existing) {
        const { error } = await supabase
          .from("legal_pages" as any)
          .update({ title, content_html: contentHtml, updated_by: user.id })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("legal_pages" as any)
          .insert({ tenant_id: tenant.id, page_key: pageKey, title, content_html: contentHtml, updated_by: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-pages", tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ["legal-page"] });
      toast({ title: "Gespeichert", description: "Die Seite wurde erfolgreich aktualisiert." });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  return { ...query, upsert };
}
