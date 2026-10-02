import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface PpaSettlement {
  id: string;
  tenant_id: string;
  contract_id: string;
  period_start: string;
  period_end: string;
  delivered_kwh: number;
  consumed_kwh: number;
  avg_spot_price_eur_kwh: number | null;
  applied_avg_price_eur_kwh: number | null;
  total_amount_eur: number;
  currency: string;
  status: "draft" | "finalized" | "invoiced" | "error";
  breakdown: any;
  error: string | null;
  computed_at: string;
  created_at: string;
  updated_at: string;
}

export function usePpaSettlements(contractId: string | undefined) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["ppa-settlements", contractId],
    enabled: !!tenant?.id && !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ppa_settlements" as any)
        .select("*")
        .eq("contract_id", contractId!)
        .eq("tenant_id", tenant!.id)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PpaSettlement[];
    },
  });
}

export function useCalculatePpaSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { contract_id: string; period_start?: string }) => {
      const { data, error } = await supabase.functions.invoke("ppa-settlement-calculate", {
        body: params,
      });
      if (error) throw error;
      return data as { period_start: string; count: number; results: any[] };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["ppa-settlements", vars.contract_id] });
    },
  });
}

export function useUpdatePpaSettlementStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; contract_id: string; status: PpaSettlement["status"] }) => {
      const { error } = await supabase
        .from("ppa_settlements" as any)
        .update({ status: params.status } as any)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["ppa-settlements", vars.contract_id] });
    },
  });
}
