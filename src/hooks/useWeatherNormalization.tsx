import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { gasM3ToKWh } from "@/lib/formatEnergy";
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
  energyType?: string;
  referenceTemperature?: number;
  year?: number;
}

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
    if (!user || !tenant) return;

    setLoading(true);
    setError(null);

    try {
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      // Determine which locations to use
      let locations: { id: string; latitude: number; longitude: number }[] = [];

      if (locationId) {
        const { data: loc } = await supabase
          .from("locations")
          .select("id, latitude, longitude")
          .eq("id", locationId)
          .single();
        if (loc?.latitude && loc?.longitude) {
          locations = [{ id: loc.id, latitude: loc.latitude, longitude: loc.longitude }];
        }
      } else {
        // All locations for this tenant with coordinates
        const { data: locs } = await supabase
          .from("locations")
          .select("id, latitude, longitude")
          .eq("tenant_id", tenant.id)
          .eq("is_archived", false)
          .not("latitude", "is", null)
          .not("longitude", "is", null);
        locations = (locs || []).filter((l) => l.latitude && l.longitude) as any[];
      }

      if (locations.length === 0) {
        setError("Keine Standorte mit Koordinaten vorhanden");
        setLoading(false);
        return;
      }

      // Get all main meters for these locations & energy type
      const locationIds = locations.map((l) => l.id);
      const { data: meters } = await supabase
        .from("meters")
        .select("id, location_id, unit, gas_type, brennwert, zustandszahl")
        .in("location_id", locationIds)
        .eq("energy_type", energyType)
        .eq("is_main_meter", true)
        .eq("is_archived", false);

      const meterMap: Record<string, { unit: string; gas_type: string | null; brennwert: number | null; zustandszahl: number | null }> = {};
      for (const m of meters || []) {
        meterMap[m.id] = { unit: m.unit, gas_type: (m as any).gas_type ?? null, brennwert: (m as any).brennwert ?? null, zustandszahl: (m as any).zustandszahl ?? null };
      }
      const meterIds = new Set(Object.keys(meterMap));

      if (meterIds.size === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // Convert raw total_value to Wh (base unit for formatEnergy)
      const toWh = (rawValue: number, meterId: string): number => {
        const m = meterMap[meterId];
        if (!m) return rawValue * 1000; // assume kWh
        if (energyType === "gas" && m.unit === "m³") {
          const kWh = gasM3ToKWh(rawValue, m.gas_type, m.brennwert, m.zustandszahl);
          return kWh * 1000; // kWh → Wh
        }
        // Default: value is in kWh → convert to Wh
        return rawValue * 1000;
      };

      // Get monthly consumption from meter_period_totals
      const { data: monthlyConsumptionRows } = await supabase
        .from("meter_period_totals")
        .select("period_start, total_value, meter_id")
        .eq("tenant_id", tenant.id)
        .eq("period_type", "month")
        .eq("energy_type", energyType)
        .gte("period_start", startDate)
        .lte("period_start", endDate)
        .order("period_start", { ascending: true });

      const monthlyConsumption: Record<string, number> = {};
      for (const row of monthlyConsumptionRows || []) {
        if (!meterIds.has(row.meter_id)) continue;
        const monthKey = row.period_start.substring(0, 7) + "-01";
        monthlyConsumption[monthKey] = (monthlyConsumption[monthKey] || 0) + toWh(row.total_value, row.meter_id);
      }

      // For the current month (and any month without monthly total), sum daily values
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      
      // Find months in the selected year that have no monthly total yet
      const monthsToFillFromDaily: string[] = [];
      for (let m = 0; m < 12; m++) {
        const mk = `${selectedYear}-${String(m + 1).padStart(2, "0")}-01`;
        const monthDate = new Date(selectedYear, m, 1);
        if (monthDate > now) break; // future month
        if (!monthlyConsumption[mk] || mk === currentMonthKey) {
          monthsToFillFromDaily.push(mk);
        }
      }

      if (monthsToFillFromDaily.length > 0) {
        const dailyStart = monthsToFillFromDaily[0];
        const lastMonth = monthsToFillFromDaily[monthsToFillFromDaily.length - 1];
        const lastMonthDate = new Date(lastMonth);
        lastMonthDate.setMonth(lastMonthDate.getMonth() + 1);
        lastMonthDate.setDate(lastMonthDate.getDate() - 1);
        const dailyEnd = lastMonthDate.toISOString().substring(0, 10);

        const { data: dailyRows } = await supabase
          .from("meter_period_totals")
          .select("period_start, total_value, meter_id")
          .eq("tenant_id", tenant.id)
          .eq("period_type", "day")
          .eq("energy_type", energyType)
          .gte("period_start", dailyStart)
          .lte("period_start", dailyEnd)
          .order("period_start", { ascending: true });

        for (const row of dailyRows || []) {
          if (!meterIds.has(row.meter_id)) continue;
          const mk = row.period_start.substring(0, 7) + "-01";
          if (monthsToFillFromDaily.includes(mk)) {
            // Only use daily sum if we don't already have a monthly total (except current month)
            if (!monthlyConsumption[mk] || mk === currentMonthKey) {
              if (mk === currentMonthKey) {
                // For current month, always rebuild from daily
                if (!monthlyConsumption[`_daily_${mk}`]) {
                  monthlyConsumption[mk] = 0;
                  monthlyConsumption[`_daily_${mk}`] = 1 as any; // marker
                }
              }
              monthlyConsumption[mk] = (monthlyConsumption[mk] || 0) + toWh(row.total_value, row.meter_id);
            }
          }
        }
        // Clean up markers
        for (const key of Object.keys(monthlyConsumption)) {
          if (key.startsWith("_daily_")) delete monthlyConsumption[key];
        }
      }

      // Fetch degree days using the first location with coordinates as reference
      const refLocation = locations[0];

      // Refresh the session to ensure a valid token
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        // Try refreshing the session
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!refreshed.session?.access_token) {
          throw new Error("Nicht authentifiziert – bitte neu anmelden");
        }
      }
      const validToken = token || (await supabase.auth.getSession()).data.session?.access_token;

      const params = new URLSearchParams({
        latitude: String(refLocation.latitude),
        longitude: String(refLocation.longitude),
        start_date: startDate,
        end_date: endDate,
        location_id: refLocation.id,
        tenant_id: tenant.id,
        reference_temperature: String(referenceTemperature),
      });

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weather-degree-days?${params}`, {
        headers: {
          Authorization: `Bearer ${validToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) {
        throw new Error(`Gradtage-Abfrage fehlgeschlagen: ${res.status}`);
      }

      const degreeDays: DegreeDayData[] = await res.json();

      // Calculate reference HDD
      const referenceHDDPerMonth = DEFAULT_REFERENCE_HDD_YEAR / 12;

      // Build normalized data
      const result: NormalizedConsumption[] = degreeDays.map((dd) => {
        const actual = monthlyConsumption[dd.month] || 0;
        const hdd = dd.heating_degree_days;
        const monthIndex = new Date(dd.month).getMonth();

        let normalized = 0;
        if (hdd > 0) {
          normalized = Math.round(((actual / hdd) * referenceHDDPerMonth) * 100) / 100;
        } else {
          normalized = actual;
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
