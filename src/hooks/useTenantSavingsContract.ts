import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type SavingsContractStatus = "draft" | "active" | "paused" | "terminated";
export type SavingsPriceBasis = "current_year_avg" | "contract_fixed";

export interface SavingsContract {
  id: string;
  tenant_id: string;
  status: SavingsContractStatus;
  baseline_year: number;
  start_year: number;
  aicono_share_pct: number;
  partner_share_pct_of_aicono: number;
  weather_normalize: boolean;
  price_basis: SavingsPriceBasis;
  fixed_price_eur_per_kwh: Record<string, number>;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavingsBaseline {
  id: string;
  contract_id: string;
  energy_type: string;
  baseline_kwh_raw: number;
  baseline_hdd: number | null;
  baseline_kwh_normalized: number;
  baseline_source: "auto_from_meters" | "manual_override" | "invoice_based";
  override_reason: string | null;
  updated_at: string;
}

export function useTenantSavingsContract(tenantId: string | null) {
  const qc = useQueryClient();

  const contract = useQuery({
    queryKey: ["tenant-savings-contract", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_savings_contracts" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SavingsContract | null) ?? null;
    },
  });

  const baselines = useQuery({
    queryKey: ["tenant-savings-baselines", contract.data?.id],
    enabled: !!contract.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_savings_baselines" as any)
        .select("*")
        .eq("contract_id", contract.data!.id)
        .order("energy_type");
      if (error) throw error;
      return (data as unknown as SavingsBaseline[]) ?? [];
    },
  });

  const upsertContract = useMutation({
    mutationFn: async (payload: Partial<SavingsContract> & { tenant_id: string }) => {
      const { data, error } = contract.data
        ? await supabase.from("tenant_savings_contracts" as any)
            .update(payload).eq("id", contract.data.id).select().maybeSingle()
        : await supabase.from("tenant_savings_contracts" as any)
            .insert(payload).select().maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-savings-contract", tenantId] });
      toast.success("Vertrag gespeichert");
    },
    onError: (e: Error) => toast.error("Speichern fehlgeschlagen: " + e.message),
  });

  const recalcBaseline = useMutation({
    mutationFn: async () => {
      if (!contract.data) throw new Error("Kein Vertrag");
      const { data, error } = await supabase.functions.invoke("savings-share-baseline", {
        body: { contract_id: contract.data.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-savings-baselines", contract.data?.id] });
      toast.success("Baseline neu berechnet");
    },
    onError: (e: Error) => toast.error("Baseline-Berechnung fehlgeschlagen: " + e.message),
  });

  const overrideBaseline = useMutation({
    mutationFn: async (params: { id: string; baseline_kwh_normalized: number; override_reason: string }) => {
      const { error } = await supabase.from("tenant_savings_baselines" as any)
        .update({
          baseline_kwh_normalized: params.baseline_kwh_normalized,
          baseline_source: "manual_override",
          override_reason: params.override_reason,
        }).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-savings-baselines", contract.data?.id] });
      toast.success("Baseline überschrieben");
    },
    onError: (e: Error) => toast.error("Override fehlgeschlagen: " + e.message),
  });

  return { contract, baselines, upsertContract, recalcBaseline, overrideBaseline };
}
