import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TopLocation {
  location_id: string;
  name: string;
  cost_month: number;
}

export interface BoardKpis {
  cost_today: number | null;
  cost_month: number | null;
  cost_ytd: number | null;
  savings_vs_last_year: number | null;
  forecast_eom: number | null;
  co2_month: number | null;        // Tonnen
  co2_ytd: number | null;          // Tonnen
  co2_avoided_tons: number | null;
  self_consumption_ratio: number | null; // %
  self_sufficiency: number | null;       // %
  pv_yield_month: number | null;         // kWh
  pv_yield_ytd: number | null;           // kWh
  top_locations: TopLocation[];
  alerts_open: number | null;
  gateway_availability: number | null;   // %
  cp_stability: number | null;           // %
  tasks_open: number | null;
  tasks_overdue: number | null;
  trading_pnl_month: number | null;      // €
  charging_kwh_month: number | null;     // kWh
  invoices_open: number | null;
}

export interface BoardKpisResponse {
  generated_at: string;
  kpis: BoardKpis;
}

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
