import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getT } from "@/i18n/getT";

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
          .update(values as any)
          .eq("id", license.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tenant_licenses")
          .insert({ tenant_id: tenantId, ...values } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-license", tenantId] });
      const t = getT();
      toast({ title: t("license.saved") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  return { license, isLoading, upsertLicense };
}
