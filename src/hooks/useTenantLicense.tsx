import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function useTenantLicense(tenantId: string | null) {
  const queryClient = useQueryClient();

  const { data: license, isLoading } = useQuery({
    queryKey: ["tenant-license", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_licenses")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const upsertLicense = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!tenantId) throw new Error("No tenant");
      if (license) {
        const { error } = await supabase
          .from("tenant_licenses")
          .update(values)
          .eq("id", license.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tenant_licenses")
          .insert({ tenant_id: tenantId, ...values });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-license", tenantId] });
      toast({ title: "Lizenz gespeichert" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  return { license, isLoading, upsertLicense };
}
