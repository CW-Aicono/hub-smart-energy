import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ChargingInvoice {
  id: string;
  tenant_id: string;
  session_id: string;
  tariff_id: string | null;
  total_energy_kwh: number;
  total_amount: number;
  idle_fee_amount: number;
  currency: string;
  status: string;
  invoice_number: string | null;
  issued_at: string | null;
  created_at: string;
}

export function useChargingInvoices() {
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["charging-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("charging_invoices").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as ChargingInvoice[];
    },
  });

  const createInvoice = useMutation({
    mutationFn: async (invoice: Partial<ChargingInvoice> & { tenant_id: string; session_id: string }) => {
      const { data, error } = await supabase.from("charging_invoices").insert(invoice).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      toast({ title: "Rechnung erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { invoices, isLoading, createInvoice };
}
