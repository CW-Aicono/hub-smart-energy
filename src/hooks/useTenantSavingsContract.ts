import { useState } from "react";
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
  coverage_months: number;
  data_quality: "complete" | "partial" | "none" | "manual" | "unknown";
  calculation_details: Record<string, any>;
  updated_at: string;
}

export interface BaselineDiagnostic {
  tenant_id: string;
  baseline_year: number;
  all_meters: number;
  eligible_meters: number;
  excluded_meters: Record<string, number>;
  written_rows: number;
  warnings: string[];
  energy_types: Array<{
    energy_type: string;
    meter_count: number;
    source_period_type: "month" | "day" | "none";
    coverage_months: number;
    first_period: string | null;
    last_period: string | null;
    total_kwh: number;
    data_quality: "complete" | "partial" | "none";
    warning: string | null;
  }>;
}

export interface BaselineRunResult {
  success: boolean;
  error?: string;
  baseline_year: number;
  results: Array<{
    energy_type: string;
    baseline_kwh_raw: number;
    baseline_hdd: number | null;
    baseline_kwh_normalized: number;
    coverage_months: number;
    data_quality: string;
  }>;
  diagnostic: BaselineDiagnostic;
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
  if (!response.ok || payload?.error) {
    const err = new Error(payload?.error || `Funktion fehlgeschlagen (${response.status})`);
    (err as any).payload = payload;
    throw err;
  }
  return payload as T;
}

export function useTenantSavingsContract(tenantId: string | null) {
  const qc = useQueryClient();
  const [lastBaselineRun, setLastBaselineRun] = useState<BaselineRunResult | null>(null);

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
      try {
        const data = await invokeFunction<BaselineRunResult>("savings-share-baseline", { contract_id: contract.data.id });
        setLastBaselineRun(data);
        return data;
      } catch (error) {
        const payload = (error as any).payload as BaselineRunResult | undefined;
        if (payload?.diagnostic) setLastBaselineRun(payload);
        throw error;
      }
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
          data_quality: "manual",
        }).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-savings-baselines", contract.data?.id] });
      toast.success("Baseline überschrieben");
    },
    onError: (e: Error) => toast.error("Override fehlgeschlagen: " + e.message),
  });

  return { contract, baselines, upsertContract, recalcBaseline, overrideBaseline, lastBaselineRun };
}
