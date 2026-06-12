import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BoardKpis {
  pv_yield_month: number | null;
  pv_yield_ytd: number | null;
  co2_avoided_tons: number | null;
  tasks_open: number | null;
  tasks_overdue: number | null;
  trading_pnl_month: number | null;
  charging_kwh_month: number | null;
  invoices_open: number | null;
  cp_stability: number | null;
}

export interface BoardKpisResponse {
  generated_at: string;
  kpis: BoardKpis;
}

/**
 * Lädt aggregierte C-Level-KPIs für den aktuellen Tenant.
 * Cache 5 Minuten, kein Re-Fetch beim Fenster-Fokus.
 */
export function useBoardKpis(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["board-kpis", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BoardKpisResponse> => {
      const { data, error } = await supabase.functions.invoke<BoardKpisResponse>("board-kpis");
      if (error) throw error;
      if (!data) throw new Error("Keine KPI-Daten erhalten");
      return data;
    },
  });
}
