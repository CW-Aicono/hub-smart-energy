import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
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
  co2_month: number | null;
  co2_ytd: number | null;
  co2_avoided_tons: number | null;
  self_consumption_ratio: number | null;
  self_sufficiency: number | null;
  pv_yield_month: number | null;
  pv_yield_ytd: number | null;
  top_locations: TopLocation[];
  alerts_open: number | null;
  gateway_availability: number | null;
  cp_stability: number | null;
  tasks_open: number | null;
  tasks_overdue: number | null;
  trading_pnl_month: number | null;
  charging_kwh_month: number | null;
  invoices_open: number | null;
}

export interface BoardKpisResponse {
  generated_at: string;
  kpis: BoardKpis;
  fromCache?: boolean;
}

const cacheKey = (tenantId: string) => `board-kpis-cache:${tenantId}`;

function readCache(tenantId: string): BoardKpisResponse | null {
  try {
    const raw = localStorage.getItem(cacheKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BoardKpisResponse;
    return { ...parsed, fromCache: true };
  } catch {
    return null;
  }
}

function writeCache(tenantId: string, data: BoardKpisResponse) {
  try {
    localStorage.setItem(cacheKey(tenantId), JSON.stringify({ ...data, fromCache: false }));
  } catch { /* quota — ignorieren */ }
}

export function useBoardKpis(tenantId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["board-kpis", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    placeholderData: () => (tenantId ? readCache(tenantId) ?? undefined : undefined),
    queryFn: async (): Promise<BoardKpisResponse> => {
      try {
        const { data, error } = await supabase.functions.invoke<BoardKpisResponse>("board-kpis");
        if (error) throw error;
        if (!data) throw new Error("Keine KPI-Daten erhalten");
        if (tenantId) writeCache(tenantId, data);
        return data;
      } catch (err) {
        // Offline / Edge nicht erreichbar → letzten Cache liefern, sonst Fehler werfen
        if (tenantId) {
          const cached = readCache(tenantId);
          if (cached) return cached;
        }
        throw err;
      }
    },
  });

  // Bei window 'online' Event: neu laden
  const qc = useQueryClient();
  useEffect(() => {
    const onOnline = () => qc.invalidateQueries({ queryKey: ["board-kpis", tenantId] });
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [qc, tenantId]);

  return query;
}
