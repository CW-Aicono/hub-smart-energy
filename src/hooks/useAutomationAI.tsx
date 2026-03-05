import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface AIRecommendation {
  id: string;
  title: string;
  description: string;
  estimated_savings_kwh: number;
  confidence: number;
  category: string;
  suggested_conditions: unknown[];
  suggested_actions: unknown[];
}

const CACHE_KEY = "mla_ai_recommendations";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function getCachedRecommendations(tenantId: string): AIRecommendation[] | null {
  try {
    const cached = localStorage.getItem(`${CACHE_KEY}_${tenantId}`);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(`${CACHE_KEY}_${tenantId}`);
      return null;
    }
    return data;
  } catch { return null; }
}

function setCachedRecommendations(tenantId: string, data: AIRecommendation[]) {
  try {
    localStorage.setItem(`${CACHE_KEY}_${tenantId}`, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

export function useAutomationAI() {
  const { tenant } = useTenant();
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async (forceRefresh = false) => {
    if (!tenant?.id) return;

    // Check cache first
    if (!forceRefresh) {
      const cached = getCachedRecommendations(tenant.id);
      if (cached) {
        setRecommendations(cached);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("automation-ai-recommendations", {
        body: { tenantId: tenant.id },
      });

      if (fnError) throw fnError;

      // Edge function may return error in body (e.g. 429, 402)
      if (data?.error) throw new Error(data.error);

      if (data?.recommendations) {
        setRecommendations(data.recommendations);
        setCachedRecommendations(tenant.id, data.recommendations);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden der KI-Empfehlungen");
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  const totalSavingsPotential = recommendations.reduce((sum, r) => sum + r.estimated_savings_kwh, 0);

  return {
    recommendations,
    loading,
    error,
    totalSavingsPotential,
    fetchRecommendations,
  };
}
