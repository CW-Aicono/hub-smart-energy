import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ChargingInvoice {
  id: string;
  tenant_id: string;
  session_id: string | null;
  user_id: string | null;
  tariff_id: string | null;
  total_energy_kwh: number;
  total_amount: number;
  net_amount: number;
  tax_amount: number;
  tax_rate_percent: number;
  idle_fee_amount: number;
  currency: string;
  status: string;
  invoice_number: string | null;
  invoice_date: string;
  period_start: string | null;
  period_end: string | null;
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
    mutationFn: async (invoice: Partial<ChargingInvoice> & { tenant_id: string }) => {
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

  const generateInvoices = useMutation({
    mutationFn: async (params: { tenant_id: string; period_start: string; period_end: string }) => {
      const { data, error } = await supabase.functions.invoke("send-charging-invoices", {
        body: {
          tenant_id: params.tenant_id,
          period_start: params.period_start,
          period_end: params.period_end,
          mode: "generate",
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      const count = data?.results?.[0]?.invoices_created ?? 0;
      toast({ title: `${count} Rechnung(en) erstellt` });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const sendInvoices = useMutation({
    mutationFn: async (params: { tenant_id: string; period_start: string; period_end: string }) => {
      const { data, error } = await supabase.functions.invoke("send-charging-invoices", {
        body: {
          tenant_id: params.tenant_id,
          period_start: params.period_start,
          period_end: params.period_end,
          mode: "send",
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      const count = data?.results?.[0]?.emails_sent ?? 0;
      toast({ title: `${count} Rechnung(en) versendet` });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const finalizeInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("charging_invoices")
        .update({ status: "issued", issued_at: new Date().toISOString() })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-invoices"] });
      toast({ title: "Rechnung ausgestellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { invoices, isLoading, createInvoice, generateInvoices, sendInvoices, finalizeInvoice };
