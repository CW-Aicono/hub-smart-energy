import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "./useTenant";

export interface DegreeDayData {
  month: string;
  heating_degree_days: number;
  cooling_degree_days: number;
  avg_temperature: number;
  reference_temperature: number;
}

export interface NormalizedConsumption {
  month: string;
  monthLabel: string;
  actualConsumption: number;
  degreeDays: number;
  avgTemperature: number;
  normalizedConsumption: number;
  deviationPercent: number;
}

interface UseWeatherNormalizationOptions {
  locationId: string | null;
  energyType?: string; // "gas" | "waerme" | "strom"
  referenceTemperature?: number;
  year?: number;
}

// DWD long-term average HDD for Germany (base 15°C), roughly 3200 HDD/year
const DEFAULT_REFERENCE_HDD_YEAR = 3200;

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function useWeatherNormalization({
  locationId,
  energyType = "gas",
  referenceTemperature = 15,
  year,
}: UseWeatherNormalizationOptions) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [data, setData] = useState<NormalizedConsumption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedYear = year || new Date().getFullYear();

  const fetchData = useCallback(async () => {
    if (!locationId || !user || !tenant) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Get location coordinates
      const { data: location } = await supabase
        .from("locations")
        .select("latitude, longitude")
        .eq("id", locationId)
        .single();

      if (!location?.latitude || !location?.longitude) {
        setError("Standort hat keine Koordinaten hinterlegt");
        setLoading(false);
        return;
      }

      // 2. Get consumption data from meter_period_totals
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      const { data: consumption } = await supabase
        .from("meter_period_totals")
        .select("period_start, total_value, meter_id, energy_type")
        .eq("tenant_id", tenant.id)
        .eq("period_type", "month")
        .eq("energy_type", energyType)
        .gte("period_start", startDate)
        .lte("period_start", endDate)
        .order("period_start", { ascending: true });

      // Filter to meters belonging to this location
      const { data: meters } = await supabase
        .from("meters")
        .select("id")
        .eq("location_id", locationId)
        .eq("energy_type", energyType)
        .eq("is_main_meter", true);

      const meterIds = new Set((meters || []).map((m) => m.id));

      // Aggregate consumption by month (sum across all main meters of this type)
      const monthlyConsumption: Record<string, number> = {};
      for (const row of consumption || []) {
        if (!meterIds.has(row.meter_id)) continue;
        const monthKey = row.period_start.substring(0, 7) + "-01";
        monthlyConsumption[monthKey] = (monthlyConsumption[monthKey] || 0) + row.total_value;
      }

      // 3. Fetch degree days via edge function
      const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weather-degree-days`;
      const params = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        start_date: startDate,
        end_date: endDate,
        location_id: locationId,
        tenant_id: tenant.id,
        reference_temperature: String(referenceTemperature),
      });

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch(`${functionsUrl}?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(`Gradtage-Abfrage fehlgeschlagen: ${res.status}`);
      }

      const degreeDays: DegreeDayData[] = await res.json();

      // 4. Calculate reference HDD (average per month from available data, or DWD default)
      const totalHDD = degreeDays.reduce((s, d) => s + d.heating_degree_days, 0);
      const monthsWithHDD = degreeDays.filter((d) => d.heating_degree_days > 0).length;
      const referenceHDDPerMonth = monthsWithHDD > 0
        ? DEFAULT_REFERENCE_HDD_YEAR / 12
        : 0;

      // 5. Build normalized data
      const result: NormalizedConsumption[] = degreeDays.map((dd) => {
        const actual = monthlyConsumption[dd.month] || 0;
        const hdd = dd.heating_degree_days;
        const monthIndex = new Date(dd.month).getMonth();

        // Normalized = (actual / actual_HDD) * reference_HDD
        let normalized = 0;
        if (hdd > 0) {
          normalized = Math.round(((actual / hdd) * referenceHDDPerMonth) * 100) / 100;
        } else {
          normalized = actual; // Summer months with no HDD: no normalization needed
        }

        const deviation = actual > 0
          ? Math.round(((normalized - actual) / actual) * 10000) / 100
          : 0;

        return {
          month: dd.month,
          monthLabel: MONTH_LABELS[monthIndex] || dd.month,
          actualConsumption: actual,
          degreeDays: hdd,
          avgTemperature: dd.avg_temperature,
          normalizedConsumption: normalized,
          deviationPercent: deviation,
        };
      });

      setData(result);
    } catch (err: any) {
      console.error("Weather normalization error:", err);
      setError(err.message || "Fehler bei der Witterungsbereinigung");
    } finally {
      setLoading(false);
    }
  }, [locationId, user, tenant, selectedYear, energyType, referenceTemperature]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalActual = data.reduce((s, d) => s + d.actualConsumption, 0);
  const totalNormalized = data.reduce((s, d) => s + d.normalizedConsumption, 0);
  const totalDeviation = totalActual > 0
    ? Math.round(((totalNormalized - totalActual) / totalActual) * 10000) / 100
    : 0;

  return {
    data,
    loading,
    error,
    totalActual,
    totalNormalized,
    totalDeviation,
    refetch: fetchData,
    hasData: data.some((d) => d.actualConsumption > 0),
  };
}
