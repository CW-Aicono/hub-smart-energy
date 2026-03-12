import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "sonner";
import { useTranslation } from "./useTranslation";

export interface SupplierInvoice {
  id: string;
  tenant_id: string;
  location_id: string | null;
  invoice_number: string | null;
  supplier_name: string | null;
  energy_type: string;
  period_start: string | null;
  period_end: string | null;
  consumption_kwh: number;
  consumption_unit: string;
  total_gross: number;
  total_net: number | null;
  tax_amount: number | null;
  currency: string;
  status: string;
  file_path: string | null;
  ai_confidence: string | null;
  ai_raw_response: any;
  correction_of_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  locations?: { name: string } | null;
  corrections?: SupplierInvoice[];
}

export function useSupplierInvoices() {
  const { tenant } = useTenant();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["supplier-invoices", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("energy_supplier_invoices")
        .select("*, locations(name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SupplierInvoice[];
    },
  });

  const createInvoice = useMutation({
    mutationFn: async (values: Partial<SupplierInvoice>) => {
      const { error } = await (supabase as any)
        .from("energy_supplier_invoices")
        .insert({ ...values, tenant_id: tenantId! });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-invoices", tenantId] });
      toast.success(t("invoices.saved" as any));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateInvoice = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Partial<SupplierInvoice>) => {
      const { error } = await (supabase as any)
        .from("energy_supplier_invoices")
        .update(values)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-invoices", tenantId] });
      toast.success(t("invoices.updated" as any));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteInvoice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("energy_supplier_invoices")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-invoices", tenantId] });
      toast.success(t("invoices.deleted" as any));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Get corrections for a specific invoice
  const getCorrections = (invoiceId: string) =>
    invoices.filter((inv) => inv.correction_of_id === invoiceId);

  // Calculate net values considering corrections
  const getNetConsumption = (invoice: SupplierInvoice) => {
    const corrections = getCorrections(invoice.id);
    if (corrections.length === 0) return invoice.consumption_kwh;
    // Latest correction replaces the value; delta = correction - original
    const latestCorrection = corrections[0]; // already sorted desc
    return latestCorrection.consumption_kwh;
  };

  const getNetAmount = (invoice: SupplierInvoice) => {
    const corrections = getCorrections(invoice.id);
    if (corrections.length === 0) return invoice.total_gross;
    const latestCorrection = corrections[0];
    return latestCorrection.total_gross;
  };

  // Invoices grouped: originals with their corrections
  const originalInvoices = invoices.filter((inv) => !inv.correction_of_id);

  return {
    invoices,
    originalInvoices,
    isLoading,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    getCorrections,
    getNetConsumption,
    getNetAmount,
    tenantId,
  };
}
