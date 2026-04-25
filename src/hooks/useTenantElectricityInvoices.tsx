import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export function useTenantElectricityInvoices() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["te-invoices", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_electricity_invoices")
        .select("*, tenant_electricity_tenants(name, unit_label), tenant_electricity_tariffs(name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createInvoice = useMutation({
    mutationFn: async (values: {
      tenant_electricity_tenant_id: string; tariff_id: string;
      period_start: string; period_end: string;
      local_kwh: number; grid_kwh: number; total_kwh: number;
      local_amount: number; grid_amount: number; base_fee: number; total_amount: number;
      invoice_number?: string;
    }) => {
      const { error } = await supabase.from("tenant_electricity_invoices").insert({ ...values, tenant_id: tenantId! });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-invoices", tenantId] });
      toast({ title: "Rechnung erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateInvoice = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Record<string, any>) => {
      const { error } = await supabase.from("tenant_electricity_invoices").update(values as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-invoices", tenantId] });
      toast({ title: "Rechnung aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const totalRevenue = invoices
    .filter((i) => i.status === "issued" || i.status === "paid")
    .reduce((sum, i) => sum + Number(i.total_amount || 0), 0);

  return { invoices, isLoading, createInvoice, updateInvoice, totalRevenue };
}
