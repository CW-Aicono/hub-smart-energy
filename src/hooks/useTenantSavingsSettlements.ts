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
    baseline_quality?: string; baseline_coverage_months?: number | null;
    actual_coverage_months?: number; actual_source_period_type?: string;
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

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Keine aktive Sitzung. Bitte erneut anmelden.");

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) throw new Error(payload?.error || `Funktion fehlgeschlagen (${response.status})`);
  return payload as T;
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
      return invokeFunction("savings-share-calculate", { contract_id: contractId, period_year: periodYear });
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
