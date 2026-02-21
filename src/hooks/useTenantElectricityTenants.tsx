import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export interface TenantWithMeters {
  id: string;
  tenant_id: string;
  location_id: string | null;
  name: string;
  unit_label: string | null;
  email: string | null;
  meter_id: string | null;
  move_in_date: string | null;
  move_out_date: string | null;
  status: string;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
  locations: { name: string } | null;
  meters: { name: string } | null;
  assigned_meters: { meter_id: string; meters: { id: string; name: string; energy_type: string; unit: string } | null }[];
}

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
        .select("*, locations(name), meters(name), tenant_electricity_tenant_meters(meter_id, meters(id, name, energy_type, unit))")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data || []).map((t: any) => ({
        ...t,
        assigned_meters: t.tenant_electricity_tenant_meters || [],
      })) as TenantWithMeters[];
    },
  });

  const createTenant = useMutation({
    mutationFn: async (values: {
      name: string; unit_label?: string; email?: string;
      location_id: string; meter_ids?: string[]; move_in_date?: string;
      is_mieterstrom?: boolean;
    }) => {
      const { meter_ids, ...rest } = values;
      const { data, error } = await supabase
        .from("tenant_electricity_tenants")
        .insert({ ...rest, tenant_id: tenantId! })
        .select("id")
        .single();
      if (error) throw error;
      if (meter_ids && meter_ids.length > 0) {
        const { error: mErr } = await supabase
          .from("tenant_electricity_tenant_meters")
          .insert(meter_ids.map((mid) => ({ tenant_electricity_tenant_id: data.id, meter_id: mid })));
        if (mErr) throw mErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-tenants", tenantId] });
      toast({ title: "Mieter erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateTenant = useMutation({
    mutationFn: async ({ id, meter_ids, ...values }: { id: string; meter_ids?: string[] } & Record<string, any>) => {
      const { error } = await supabase.from("tenant_electricity_tenants").update(values).eq("id", id);
      if (error) throw error;
      if (meter_ids !== undefined) {
        // Remove old assignments and insert new ones
        await supabase.from("tenant_electricity_tenant_meters").delete().eq("tenant_electricity_tenant_id", id);
        if (meter_ids.length > 0) {
          const { error: mErr } = await supabase
            .from("tenant_electricity_tenant_meters")
            .insert(meter_ids.map((mid) => ({ tenant_electricity_tenant_id: id, meter_id: mid })));
          if (mErr) throw mErr;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-tenants", tenantId] });
      toast({ title: "Mieter aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const archiveTenant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tenant_electricity_tenants")
        .update({ status: "archived", move_out_date: new Date().toISOString().split("T")[0] })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-tenants", tenantId] });
      toast({ title: "Mieter archiviert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const activeTenants = tenants.filter((t) => t.status === "active");
  const archivedTenants = tenants.filter((t) => t.status === "archived");

  return { tenants, activeTenants, archivedTenants, isLoading, createTenant, updateTenant, archiveTenant };
}
