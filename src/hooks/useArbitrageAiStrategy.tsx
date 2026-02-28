import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { useTranslation } from "./useTranslation";
import { toast } from "./use-toast";

export interface ChargeDischargeWindow {
  start: string;
  end: string;
  reason: string;
}

export interface AiStrategySuggestion {
  name: string;
  storage_name: string;
  storage_id: string | null;
  buy_below_eur_mwh: number;
  sell_above_eur_mwh: number;
  charge_windows: ChargeDischargeWindow[];
  discharge_windows: ChargeDischargeWindow[];
  estimated_revenue_eur: number;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

export interface AiStrategyResult {
  suggestions: AiStrategySuggestion[];
  market_summary: string;
  generated_at: string;
}

export function useArbitrageAiStrategy() {
  const { tenant } = useTenant();
  const { t, language } = useTranslation();
  const tenantId = tenant?.id;
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();

  const { data, refetch } = useQuery<AiStrategyResult | null>({
    queryKey: ["arbitrage-ai-strategy", tenantId],
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
  });

  const generate = async () => {
    if (!tenantId) return;
    setIsGenerating(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("arbitrage-ai-strategy", {
        body: { tenant_id: tenantId, language },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      queryClient.setQueryData(["arbitrage-ai-strategy", tenantId], result as AiStrategyResult);
      toast({ title: t("aiArb.generated"), description: `${result.suggestions?.length || 0} ${t("aiArb.suggestionsCount")}` });
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return { result: data ?? null, isGenerating, generate };
}
