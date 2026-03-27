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
  poa_w_m2?: number | null;
  dni_w_m2?: number | null;
  dhi_w_m2?: number | null;
  cell_temp_c?: number | null;
  temperature_2m?: number | null;
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
    ai_correction_factor?: number;
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
  recalibration_locked?: boolean;
  recalibration_locked_until?: string | null;
}

function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDisplayValue(entry: PvHourlyEntry) {
  // KI-Korrekturfaktor temporär deaktiviert – nur Rohmodell-Prognose anzeigen
  return entry.estimated_kwh;
}

function sumOptional(current?: number | null, incoming?: number | null) {
  if (current == null && incoming == null) return null;
  return Math.round((((current ?? 0) + (incoming ?? 0)) * 100)) / 100;
}

function averageOptional(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number");
  if (filtered.length === 0) return null;
  return Math.round((filtered.reduce((sum, value) => sum + value, 0) / filtered.length) * 100) / 100;
}

function aggregateForecasts(forecasts: PvForecast[]): PvForecast {
  if (forecasts.length === 1) return forecasts[0];

  const hourlyMap = new Map<string, PvHourlyEntry & { count: number }>();

  for (const forecast of forecasts) {
    for (const hour of forecast.hourly) {
      const existing = hourlyMap.get(hour.timestamp);
      if (existing) {
        existing.estimated_kwh = Math.round((existing.estimated_kwh + hour.estimated_kwh) * 100) / 100;
        existing.ai_adjusted_kwh = sumOptional(existing.ai_adjusted_kwh, hour.ai_adjusted_kwh);
        existing.radiation_w_m2 = averageOptional([existing.radiation_w_m2, hour.radiation_w_m2]) ?? existing.radiation_w_m2;
        existing.cloud_cover_pct = Math.round((existing.cloud_cover_pct * existing.count + hour.cloud_cover_pct) / (existing.count + 1));
        existing.poa_w_m2 = averageOptional([existing.poa_w_m2, hour.poa_w_m2]);
        existing.dni_w_m2 = averageOptional([existing.dni_w_m2, hour.dni_w_m2]);
        existing.dhi_w_m2 = averageOptional([existing.dhi_w_m2, hour.dhi_w_m2]);
        existing.cell_temp_c = averageOptional([existing.cell_temp_c, hour.cell_temp_c]);
        existing.temperature_2m = averageOptional([existing.temperature_2m, hour.temperature_2m]);
        existing.count += 1;
      } else {
        hourlyMap.set(hour.timestamp, { ...hour, count: 1 });
      }
    }
  }

  const hourly = Array.from(hourlyMap.values())
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(({ count: _count, ...rest }) => rest);
  const totalKwp = forecasts.reduce((sum, forecast) => sum + forecast.settings.peak_power_kwp, 0);

  const now = new Date();
  const todayStr = toLocalDateStr(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toLocalDateStr(tomorrow);

  const todayTotal = hourly.filter((hour) => hour.timestamp.startsWith(todayStr)).reduce((sum, hour) => sum + getDisplayValue(hour), 0);
  const tomorrowTotal = hourly.filter((hour) => hour.timestamp.startsWith(tomorrowStr)).reduce((sum, hour) => sum + getDisplayValue(hour), 0);
  const peakEntry = hourly.reduce((best, hour) => (!best || getDisplayValue(hour) > getDisplayValue(best) ? hour : best), hourly[0] ?? null);

  return {
    location: { name: `Alle Anlagen (${forecasts.length})`, city: null },
    settings: { peak_power_kwp: totalKwp, tilt_deg: 0, azimuth_deg: 0 },
    hourly,
    summary: {
      today_total_kwh: Math.round(todayTotal * 10) / 10,
      tomorrow_total_kwh: Math.round(tomorrowTotal * 10) / 10,
      peak_hour: peakEntry?.timestamp || null,
      peak_kwh: peakEntry ? Math.round(getDisplayValue(peakEntry) * 100) / 100 : 0,
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
  const hourly: PvHourlyEntry[] = Array.from({ length: 24 }, (_, index) => {
    const timestamp = `${todayStr}T${String(index).padStart(2, "0")}:00`;
    const sun = index >= 6 && index <= 20 ? Math.sin(((index - 6) / 14) * Math.PI) : 0;
    const poa = Math.round(sun * 980);
    const ambientTemp = Math.round((12 + sun * 14) * 10) / 10;
    const moduleTemp = Math.round((ambientTemp + ((45 - 20) / 800) * poa) * 10) / 10;
    const estimated = Math.round(((poa / 1000) * 42 * Math.max(0.7, 1 - 0.004 * (moduleTemp - 25)) * 0.86 * 0.97) * 100) / 100;
    const aiAdjusted = Math.round(estimated * 0.98 * 100) / 100;

    return {
      timestamp,
      radiation_w_m2: poa,
      cloud_cover_pct: Math.round(Math.random() * 30),
      estimated_kwh: estimated,
      ai_adjusted_kwh: aiAdjusted,
      poa_w_m2: poa,
      dni_w_m2: null,
      dhi_w_m2: Math.round(sun * 180),
      cell_temp_c: moduleTemp,
      temperature_2m: ambientTemp,
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
      ai_notes: "GTI-basierte Demo-Prognose mit leichter KI-Korrektur.",
      performance_ratio: 0.8,
      pr_auto_updated: false,
      ai_correction_factor: 0.98,
    },
    weather_source: {
      provider: "Open-Meteo",
      profile: "PV-Erzeugungsprognose (GTI Demo)",
      model: "icon_seamless",
      endpoint: "https://api.open-meteo.com/v1/forecast",
      request_timezone: "Europe/Berlin",
      response_timezone: "Europe/Berlin",
      forecast_days: 2,
      hourly_variables: ["global_tilted_irradiance", "diffuse_radiation", "temperature_2m", "wind_speed_10m", "cloud_cover"],
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

async function callPvForecastEdge(locationId: string, token: string) {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pv-forecast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ location_id: locationId }),
  });

  return response;
}

async function fetchPvForecastForLocation(locationId: string): Promise<PvForecast | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  let token = sessionData.session?.access_token ?? null;

  if (!token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token ?? null;
  }

  if (!token) return null;

  let response = await callPvForecastEdge(locationId, token);

  if (response.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.session?.access_token ?? null;
    if (!refreshedToken) return null;
    response = await callPvForecastEdge(locationId, refreshedToken);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`PV-Prognose fehlgeschlagen (${response.status}): ${message}`);
  }

  const data = await response.json();
  if (!data || !data.hourly || !data.summary) return null;
  return data as PvForecast;
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
        const { data: loc } = await supabase
          .from("locations")
          .select("latitude,longitude")
          .eq("id", locationId)
          .maybeSingle();
        if (!loc?.latitude || !loc?.longitude) return null;

        return fetchPvForecastForLocation(locationId);
      }

      if (!tenantId) return null;
      const { data: allSettings, error: settingsError } = await supabase
        .from("pv_forecast_settings")
        .select("location_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (settingsError) throw settingsError;
      if (!allSettings || allSettings.length === 0) return null;

      const results = await Promise.allSettled(
        allSettings.map((setting) => fetchPvForecastForLocation(setting.location_id))
      );

      const forecasts = results
        .filter((result): result is PromiseFulfilledResult<PvForecast | null> => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((value): value is PvForecast => value !== null);

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

      const currentSettings = queryClient.getQueryData<PvForecastSettings | null>(["pv-forecast-settings", locationId]);

      if (currentSettings?.id) {
        const { error } = await supabase
          .from("pv_forecast_settings")
          .update(values)
          .eq("id", currentSettings.id);
        if (error) throw error;
      } else {
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
    onError: (error) => toast.error("Fehler: " + error.message),
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
