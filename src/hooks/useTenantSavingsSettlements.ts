import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type SettlementStatus = "draft" | "approved" | "invoiced" | "paid" | "void";

export interface SavingsSettlement {
  id: string;
  contract_id: string;
  period_year: number;
  status: SettlementStatus;
  per_energy_type: Array<{
    energy_type: string; baseline_kwh: number; actual_kwh: number;
    hdd_factor: number; avg_price_eur_per_kwh: number;
    savings_kwh: number; savings_eur: number;
  }>;
  total_savings_eur: number;
  aicono_amount_eur: number;
  partner_amount_eur: number;
  tenant_retained_eur: number;
  approved_by: string | null;
  approved_at: string | null;
  invoice_ref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useTenantSavingsSettlements(contractId: string | null) {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["tenant-savings-settlements", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_savings_settlements" as any)
        .select("*")
        .eq("contract_id", contractId!)
        .order("period_year", { ascending: false });
      if (error) throw error;
      return (data as unknown as SavingsSettlement[]) ?? [];
    },
  });

  const calculate = useMutation({
    mutationFn: async (periodYear: number) => {
      if (!contractId) throw new Error("Kein Vertrag");
      const { data, error } = await supabase.functions.invoke("savings-share-calculate", {
        body: { contract_id: contractId, period_year: periodYear },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-savings-settlements", contractId] });
      toast.success("Abrechnung berechnet");
    },
    onError: (e: Error) => toast.error("Berechnung fehlgeschlagen: " + e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async (params: { id: string; status: SettlementStatus; invoice_ref?: string | null }) => {
      const patch: any = { status: params.status };
      if (params.status === "approved") { patch.approved_at = new Date().toISOString(); }
      if (params.invoice_ref !== undefined) patch.invoice_ref = params.invoice_ref;
      const { error } = await supabase.from("tenant_savings_settlements" as any)
        .update(patch).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-savings-settlements", contractId] });
      toast.success("Status aktualisiert");
    },
    onError: (e: Error) => toast.error("Update fehlgeschlagen: " + e.message),
  });

  return { list, calculate, updateStatus };
}
