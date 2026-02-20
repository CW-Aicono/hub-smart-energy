import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export function useTenantElectricitySettings(locationId?: string) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: settings, isLoading } = useQuery({
    queryKey: ["te-settings", tenantId, locationId],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from("tenant_electricity_settings")
        .select("*")
        .eq("tenant_id", tenantId!);
      if (locationId) query = query.eq("location_id", locationId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const upsertSettings = useMutation({
    mutationFn: async (values: {
      location_id?: string; pv_meter_id?: string; grid_meter_id?: string;
      allocation_method?: string; billing_period?: string;
    }) => {
      if (settings?.id) {
        const { error } = await supabase.from("tenant_electricity_settings").update(values).eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenant_electricity_settings").insert({ ...values, tenant_id: tenantId! });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-settings", tenantId] });
      toast({ title: "Einstellungen gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { settings, isLoading, upsertSettings };
}
