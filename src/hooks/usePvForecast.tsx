import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "sonner";

export interface PvHourlyEntry {
  timestamp: string;
  radiation_w_m2: number;
  cloud_cover_pct: number;
  estimated_kwh: number;
  ai_adjusted_kwh: number | null;
}

export interface PvForecast {
  location: { name: string; city: string | null };
  settings: { peak_power_kwp: number; tilt_deg: number; azimuth_deg: number };
  hourly: PvHourlyEntry[];
  summary: {
    today_total_kwh: number;
    tomorrow_total_kwh: number;
    peak_hour: string | null;
    peak_kwh: number;
    ai_confidence: string;
    ai_notes: string;
  };
}

export interface PvForecastSettings {
  id: string;
  tenant_id: string;
  location_id: string;
  pv_meter_id: string | null;
  peak_power_kwp: number;
  tilt_deg: number;
  azimuth_deg: number;
  is_active: boolean;
}

export function usePvForecast(locationId: string | null) {
  const { data: forecast, isLoading, error, refetch } = useQuery({
    queryKey: ["pv-forecast", locationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pv-forecast", {
        body: { location_id: locationId },
      });
      if (error) throw error;
      return data as PvForecast;
    },
    enabled: !!locationId,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

  return { forecast: forecast ?? null, isLoading, error, refetch };
}

export function usePvForecastSettings(locationId: string | null) {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["pv-forecast-settings", locationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pv_forecast_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("location_id", locationId!)
        .maybeSingle();
      if (error) throw error;
      return data as PvForecastSettings | null;
    },
    enabled: !!tenantId && !!locationId,
  });

  const upsertSettings = useMutation({
    mutationFn: async (values: {
      peak_power_kwp: number;
      tilt_deg: number;
      azimuth_deg: number;
      pv_meter_id: string | null;
      is_active: boolean;
    }) => {
      if (!locationId || !tenantId) throw new Error("Missing context");

      // Always read the latest settings from the query cache to avoid stale closures
      const currentSettings = queryClient.getQueryData<PvForecastSettings | null>(["pv-forecast-settings", locationId]);

      if (currentSettings?.id) {
        const { error } = await supabase
          .from("pv_forecast_settings")
          .update(values)
          .eq("id", currentSettings.id);
        if (error) throw error;
      } else {
        // Use upsert to prevent duplicate insert errors
        const { error } = await supabase
          .from("pv_forecast_settings")
          .upsert(
            { ...values, location_id: locationId, tenant_id: tenantId },
            { onConflict: "tenant_id,location_id" }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("PV-Einstellungen gespeichert");
      queryClient.invalidateQueries({ queryKey: ["pv-forecast-settings", locationId] });
      queryClient.invalidateQueries({ queryKey: ["pv-forecast", locationId] });
    },
    onError: (e) => toast.error("Fehler: " + e.message),
  });

  const deleteSettings = useMutation({
    mutationFn: async () => {
      if (!settings?.id) return;
      const { error } = await supabase
        .from("pv_forecast_settings")
        .delete()
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("PV-Einstellungen entfernt");
      queryClient.invalidateQueries({ queryKey: ["pv-forecast-settings", locationId] });
    },
  });

  return { settings: settings ?? null, isLoading, upsertSettings, deleteSettings };
}
