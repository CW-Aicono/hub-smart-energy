import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export function useTenantElectricityTenants() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["te-tenants", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_electricity_tenants")
        .select("*, locations(name), meters(name)")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createTenant = useMutation({
    mutationFn: async (values: {
      name: string; unit_label?: string; email?: string;
      location_id?: string; meter_id?: string; move_in_date?: string;
    }) => {
      const { error } = await supabase.from("tenant_electricity_tenants").insert({ ...values, tenant_id: tenantId! });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-tenants", tenantId] });
      toast({ title: "Mieter erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateTenant = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Record<string, any>) => {
      const { error } = await supabase.from("tenant_electricity_tenants").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-tenants", tenantId] });
      toast({ title: "Mieter aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteTenant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenant_electricity_tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-tenants", tenantId] });
      toast({ title: "Mieter gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const activeTenants = tenants.filter((t) => t.status === "active");

  return { tenants, activeTenants, isLoading, createTenant, updateTenant, deleteTenant };
}
