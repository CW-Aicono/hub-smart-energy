import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "./use-toast";

export interface LegalPage {
  id: string;
  tenant_id: string | null;
  page_key: string;
  title: string;
  content_html: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Fetch a single legal page by key (platform-wide, no tenant needed).
 */
export function useLegalPage(pageKey: string) {
  return useQuery({
    queryKey: ["legal-page", pageKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_pages" as any)
        .select("*")
        .eq("page_key", pageKey)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as LegalPage) ?? null;
    },
  });
}

/**
 * Fetch all legal pages (platform-wide, for super-admin use).
 */
export function useLegalPages() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["legal-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_pages" as any)
        .select("*");
      if (error) throw error;
      return (data as unknown as LegalPage[]) ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async ({ pageKey, title, contentHtml }: { pageKey: string; title: string; contentHtml: string }) => {
      if (!user?.id) throw new Error("Not authenticated");

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
          .insert({ page_key: pageKey, title, content_html: contentHtml, updated_by: user.id, tenant_id: null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-pages"] });
      queryClient.invalidateQueries({ queryKey: ["legal-page"] });
      toast({ title: "Gespeichert", description: "Die Seite wurde erfolgreich aktualisiert." });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  return { ...query, upsert };
}
