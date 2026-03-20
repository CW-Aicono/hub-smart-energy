import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export interface CopilotInputParams {
  roof_area_sqm?: number;
  grid_connection_kva?: number;
  budget_limit?: number;
}

export interface CopilotRecommendation {
  technology: string;
  title: string;
  description: string;
  capacity: string;
  estimated_cost_eur: number;
  estimated_savings_year_eur: number;
  confidence: "high" | "medium" | "low";
  rationale?: string;
}

export interface CopilotROIScenario {
  name: string;
  technologies: string[];
  total_investment_eur: number;
  total_funding_eur: number;
  annual_savings_eur: number;
  roi_years: number;
  co2_savings_tons_year?: number;
}

export interface CopilotFundingMatch {
  program_name: string;
  level: "bund" | "land" | "kommune";
  estimated_amount_eur: number;
  applicable_technologies: string[];
  notes?: string;
}

export interface CopilotSummary {
  total_investment_eur: number;
  total_funding_eur: number;
  best_roi_years: number;
  annual_savings_eur: number;
  co2_savings_tons_year?: number;
  key_insight: string;
}

export interface CopilotAnalysisResult {
  analysis: any;
  summary: CopilotSummary;
  recommendations: CopilotRecommendation[];
  roi_scenarios: CopilotROIScenario[];
  funding_matches: CopilotFundingMatch[];
}

// ── Savings Potential types ──

export interface SavingsFinding {
  title: string;
  description: string;
  category: "base_load" | "peak_load" | "operating_hours" | "pv_optimization" | "seasonal" | "behavior";
  priority: "high" | "medium" | "low";
  estimated_savings_kwh_year: number;
  estimated_savings_eur_year: number;
  estimated_co2_savings_kg_year: number;
  action_item: string;
  data_basis?: string;
}

export interface SavingsSummary {
  total_savings_kwh_year: number;
  total_savings_eur_year: number;
  total_co2_savings_kg_year: number;
  key_insight: string;
  data_quality_note?: string;
}

export interface SavingsPotentialResult {
  analysis: any;
  findings: SavingsFinding[];
  savings_summary: SavingsSummary;
}

export function useCopilotAnalysis() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: analyses = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["copilot-analyses", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copilot_analyses" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const runAnalysis = useMutation({
    mutationFn: async (params: {
      location_id?: string;
      location_ids?: string[];
      input_params?: CopilotInputParams;
    }): Promise<CopilotAnalysisResult> => {
      const { data, error } = await supabase.functions.invoke("copilot-analysis", {
        body: params,
      });
      if (error) {
        let detail = "";
        try {
          if ((error as any).context?.json) {
            const body = await ((error as any).context as Response).json();
            detail = body.detail || body.error || "";
          }
        } catch {}
        throw new Error(detail || error.message || "Analyse fehlgeschlagen");
      }
      if (data?.error) throw new Error(data.detail || data.error);
      return data as CopilotAnalysisResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copilot-analyses", tenantId] });
    },
    onError: (e: Error) => {
      toast({
        title: "Analyse fehlgeschlagen",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const runSavingsAnalysis = useMutation({
    mutationFn: async (params: {
      location_id: string;
      period_days?: number;
    }): Promise<SavingsPotentialResult> => {
      const { data, error } = await supabase.functions.invoke("copilot-analysis", {
        body: { ...params, analysis_mode: "savings_potential" },
      });
      if (error) {
        let detail = "";
        try {
          if ((error as any).context?.json) {
            const body = await ((error as any).context as Response).json();
            detail = body.detail || body.error || "";
          }
        } catch {}
        throw new Error(detail || error.message || "Analyse fehlgeschlagen");
      }
      if (data?.error) throw new Error(data.detail || data.error);
      return data as SavingsPotentialResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copilot-analyses", tenantId] });
    },
    onError: (e: Error) => {
      toast({
        title: "Einsparpotential-Analyse fehlgeschlagen",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  return {
    analyses,
    isLoadingHistory,
    runAnalysis,
    isAnalyzing: runAnalysis.isPending,
    runSavingsAnalysis,
    isAnalyzingSavings: runSavingsAnalysis.isPending,
  };
}
