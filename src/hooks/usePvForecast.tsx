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

export interface PvForecastWeatherSource {
  provider: string;
  profile: string;
  model: string;
  endpoint: string;
  request_timezone: string;
  response_timezone: string;
  forecast_days: number;
  hourly_variables: string[];
  requested_url: string;
  requested_coordinates: {
    latitude: number;
    longitude: number;
  };
  resolved_coordinates: {
    latitude: number;
    longitude: number;
  };
}

export interface PvForecastCloudCoverEntry {
  timestamp: string;
  cloud_cover_pct: number;
}

export interface PvForecastValidationProfile extends PvForecastWeatherSource {
  hourly_cloud_cover_today: PvForecastCloudCoverEntry[];
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
    performance_ratio?: number;
    pr_auto_updated?: boolean;
  };
  weather_source: PvForecastWeatherSource | null;
  validation: {
    dwd_reference: PvForecastValidationProfile | null;
  } | null;
}

export interface PvForecastSettings {
  id: string;
  tenant_id: string;
  location_id: string;
  pv_meter_id: string | null;
  peak_power_kwp: number;
  tilt_deg: number;
  azimuth_deg: number;
  performance_ratio: number;
  is_active: boolean;
}

function aggregateForecasts(forecasts: PvForecast[]): PvForecast {
  if (forecasts.length === 1) return forecasts[0];

  const hourlyMap = new Map<string, PvHourlyEntry>();
  for (const fc of forecasts) {
    for (const h of fc.hourly) {
      const existing = hourlyMap.get(h.timestamp);
      if (existing) {
        existing.radiation_w_m2 = Math.max(existing.radiation_w_m2, h.radiation_w_m2);
        existing.cloud_cover_pct = Math.round((existing.cloud_cover_pct + h.cloud_cover_pct) / 2);
        existing.estimated_kwh = Math.round((existing.estimated_kwh + h.estimated_kwh) * 100) / 100;
        existing.ai_adjusted_kwh =
          existing.ai_adjusted_kwh != null || h.ai_adjusted_kwh != null
            ? Math.round(((existing.ai_adjusted_kwh ?? existing.estimated_kwh) + (h.ai_adjusted_kwh ?? h.estimated_kwh)) * 100) / 100
            : null;
      } else {
        hourlyMap.set(h.timestamp, { ...h });
      }
    }
  }
  const hourly = Array.from(hourlyMap.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const totalKwp = forecasts.reduce((s, f) => s + f.settings.peak_power_kwp, 0);
  const getValue = (h: PvHourlyEntry) => h.ai_adjusted_kwh ?? h.estimated_kwh;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  const todayTotal = hourly.filter((h) => h.timestamp.startsWith(todayStr)).reduce((s, h) => s + getValue(h), 0);
  const tomorrowTotal = hourly.filter((h) => h.timestamp.startsWith(tomorrowStr)).reduce((s, h) => s + getValue(h), 0);
  const peakEntry = hourly.reduce((best, h) => (getValue(h) > getValue(best) ? h : best), hourly[0]);

  return {
    location: { name: `Alle Anlagen (${forecasts.length})`, city: null },
    settings: { peak_power_kwp: totalKwp, tilt_deg: 0, azimuth_deg: 0 },
    hourly,
    summary: {
      today_total_kwh: Math.round(todayTotal * 10) / 10,
      tomorrow_total_kwh: Math.round(tomorrowTotal * 10) / 10,
      peak_hour: peakEntry?.timestamp || null,
      peak_kwh: peakEntry ? Math.round(getValue(peakEntry) * 100) / 100 : 0,
      ai_confidence: "",
      ai_notes: "",
    },
    weather_source: null,
    validation: null,
  };
}

function buildDemoForecast(locationId: string | null): PvForecast {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const hourly: PvHourlyEntry[] = Array.from({ length: 24 }, (_, i) => {
    const h = `${todayStr}T${String(i).padStart(2, "0")}:00`;
    const sun = i >= 6 && i <= 20 ? Math.sin(((i - 6) / 14) * Math.PI) : 0;
    const kwh = Math.round(sun * 8.5 * 100) / 100;
    return {
      timestamp: h,
      radiation_w_m2: Math.round(sun * 850),
      cloud_cover_pct: Math.round(Math.random() * 30),
      estimated_kwh: kwh,
      ai_adjusted_kwh: Math.round(kwh * 0.95 * 100) / 100,
    };
  });

  const locName = locationId === "demo-loc-1"
    ? "Hauptverwaltung"
    : locationId === "demo-loc-2"
      ? "Wasserwerk Nord"
      : locationId === "demo-loc-3"
        ? "Kläranlage Süd"
        : locationId === "demo-loc-4"
          ? "Stadtbücherei"
          : "Alle Anlagen (4)";

  return {
    location: { name: locName, city: "Musterstadt" },
    settings: { peak_power_kwp: 42, tilt_deg: 30, azimuth_deg: 180 },
    hourly,
    summary: {
      today_total_kwh: 48.3,
      tomorrow_total_kwh: 52.1,
      peak_hour: `${todayStr}T12:00`,
      peak_kwh: 8.1,
      ai_confidence: "hoch",
      ai_notes: "Klarer Himmel erwartet, leichte Bewölkung am Nachmittag.",
      performance_ratio: 0.85,
      pr_auto_updated: false,
    },
    weather_source: {
      provider: "Open-Meteo",
      profile: "PV-Erzeugungsprognose (Demo)",
      model: "icon_seamless",
      endpoint: "https://api.open-meteo.com/v1/forecast",
      request_timezone: "Europe/Berlin",
      response_timezone: "Europe/Berlin",
      forecast_days: 1,
      hourly_variables: ["shortwave_radiation", "direct_normal_irradiance", "diffuse_radiation", "cloud_cover", "temperature_2m"],
      requested_url: "demo://pv-forecast",
      requested_coordinates: { latitude: 52.09, longitude: 7.42 },
      resolved_coordinates: { latitude: 52.09, longitude: 7.42 },
    },
    validation: {
      dwd_reference: {
        provider: "Open-Meteo",
        profile: "DWD-Cloud-Cover-Referenz (Demo)",
        model: "icon_seamless",
        endpoint: "https://api.open-meteo.com/v1/forecast",
        request_timezone: "GMT",
        response_timezone: "GMT",
        forecast_days: 1,
        hourly_variables: ["cloud_cover"],
        requested_url: "demo://pv-forecast-reference",
        requested_coordinates: { latitude: 52.09, longitude: 7.42 },
        resolved_coordinates: { latitude: 52.09, longitude: 7.42 },
        hourly_cloud_cover_today: hourly.map((entry) => ({
          timestamp: entry.timestamp,
          cloud_cover_pct: entry.cloud_cover_pct,
        })),
      },
    },
  };
}

export function usePvForecast(locationId: string | null) {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const isDemo = tenantId === "demo-tenant-id";

  const { data: forecast, isLoading, error, refetch } = useQuery({
    queryKey: ["pv-forecast", locationId ?? "all", tenantId],
    queryFn: async () => {
      if (isDemo) return buildDemoForecast(locationId);

      if (locationId) {
        // Single location – existing behaviour
        const { data, error } = await supabase.functions.invoke("pv-forecast", {
          body: { location_id: locationId },
        });
        if (error) throw error;
        if (!data || !data.hourly || !data.summary) return null;
        return data as PvForecast;
      }

      // No location selected → fetch all active PV settings and aggregate
      if (!tenantId) return null;
      const { data: allSettings, error: sErr } = await supabase
        .from("pv_forecast_settings")
        .select("location_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (sErr) throw sErr;
      if (!allSettings || allSettings.length === 0) return null;

      const results = await Promise.allSettled(
        allSettings.map((s) =>
          supabase.functions.invoke("pv-forecast", { body: { location_id: s.location_id } }).then((r) => {
            if (r.error) throw r.error;
            return r.data as PvForecast;
          })
        )
      );
      const forecasts = results
        .filter((r): r is PromiseFulfilledResult<PvForecast> => r.status === "fulfilled")
        .map((r) => r.value);

      if (forecasts.length === 0) return null;
      return aggregateForecasts(forecasts);
    },
    enabled: !!locationId || !!tenantId,
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
      performance_ratio: number;
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
      queryClient.invalidateQueries({ queryKey: ["pv-forecast"] });
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
      queryClient.invalidateQueries({ queryKey: ["pv-forecast"] });
    },
  });

  return { settings: settings ?? null, isLoading, upsertSettings, deleteSettings };
}
