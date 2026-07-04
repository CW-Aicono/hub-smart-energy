import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { gasM3ToKWh } from "@/lib/formatEnergy";
import { useTenant } from "./useTenant";
import {
  estimateHotWaterBaselineKwhPerMonth,
  normalizeHeatConsumptionWithBaseline,
  isHeatType,
  type HotWaterSource,
} from "@/lib/report/weatherCorrection";


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
  hotWaterConsumption: number;
}

export interface LocationHotWaterInfo {
  locationId: string;
  source: HotWaterSource;
  perMonthKwh: number;
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
  const [hotWaterInfo, setHotWaterInfo] = useState<LocationHotWaterInfo[]>([]);
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

      // Determine which locations to use (incl. WW override fields)
      type LocRow = {
        id: string;
        latitude: number;
        longitude: number;
        hot_water_via_gas: boolean | null;
        hot_water_gas_kwh_year: number | null;
        hot_water_gas_share_pct: number | null;
      };
      let locations: LocRow[] = [];

      const locationSelect =
        "id, latitude, longitude, hot_water_via_gas, hot_water_gas_kwh_year, hot_water_gas_share_pct";

      if (locationId) {
        const { data: loc } = await supabase
          .from("locations")
          .select(locationSelect)
          .eq("id", locationId)
          .single();
        if (loc?.latitude && loc?.longitude) {
          locations = [loc as LocRow];
        }
      } else {
        const { data: locs } = await supabase
          .from("locations")
          .select(locationSelect)
          .eq("tenant_id", tenant.id)
          .eq("is_archived", false)
          .not("latitude", "is", null)
          .not("longitude", "is", null);
        locations = ((locs || []) as LocRow[]).filter((l) => l.latitude && l.longitude);
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

      const meterMap: Record<
        string,
        { location_id: string; unit: string; gas_type: string | null; brennwert: number | null; zustandszahl: number | null }
      > = {};
      for (const m of meters || []) {
        meterMap[m.id] = {
          location_id: (m as any).location_id,
          unit: m.unit,
          gas_type: (m as any).gas_type ?? null,
          brennwert: (m as any).brennwert ?? null,
          zustandszahl: (m as any).zustandszahl ?? null,
        };
      }
      const meterIds = new Set(Object.keys(meterMap));

      if (meterIds.size === 0) {
        setData([]);
        setHotWaterInfo([]);
        setLoading(false);
        return;
      }

      // Convert raw total_value to Wh
      const toWh = (rawValue: number, meterId: string): number => {
        const m = meterMap[meterId];
        if (!m) return rawValue * 1000;
        if (energyType === "gas" && m.unit === "m³") {
          const kWh = gasM3ToKWh(rawValue, m.gas_type, m.brennwert, m.zustandszahl);
          return kWh * 1000;
        }
        return rawValue * 1000;
      };

      // Per-location, per-month consumption (Wh)
      const perLoc: Record<string, Record<string, number>> = {};
      const addToLoc = (locId: string, monthKey: string, wh: number) => {
        if (!perLoc[locId]) perLoc[locId] = {};
        perLoc[locId][monthKey] = (perLoc[locId][monthKey] || 0) + wh;
      };

      const { data: monthlyConsumptionRows } = await supabase
        .from("meter_period_totals")
        .select("period_start, total_value, meter_id")
        .eq("tenant_id", tenant.id)
        .eq("period_type", "month")
        .eq("energy_type", energyType)
        .gte("period_start", startDate)
        .lte("period_start", endDate)
        .order("period_start", { ascending: true });

      const monthsWithMonthly = new Set<string>();
      for (const row of monthlyConsumptionRows || []) {
        if (!meterIds.has(row.meter_id)) continue;
        const monthKey = row.period_start.substring(0, 7) + "-01";
        const locId = meterMap[row.meter_id].location_id;
        addToLoc(locId, monthKey, toWh(row.total_value, row.meter_id));
        monthsWithMonthly.add(monthKey);
      }

      // Fill missing / current month from daily
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const monthsToFillFromDaily: string[] = [];
      for (let m = 0; m < 12; m++) {
        const mk = `${selectedYear}-${String(m + 1).padStart(2, "0")}-01`;
        const monthDate = new Date(selectedYear, m, 1);
        if (monthDate > now) break;
        if (!monthsWithMonthly.has(mk) || mk === currentMonthKey) {
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

        // Reset current month for locations (always rebuilt from daily)
        for (const locId of Object.keys(perLoc)) {
          if (perLoc[locId][currentMonthKey]) perLoc[locId][currentMonthKey] = 0;
        }

        for (const row of dailyRows || []) {
          if (!meterIds.has(row.meter_id)) continue;
          const mk = row.period_start.substring(0, 7) + "-01";
          if (!monthsToFillFromDaily.includes(mk)) continue;
          // Skip if we already have a monthly total (except current month)
          if (monthsWithMonthly.has(mk) && mk !== currentMonthKey) continue;
          const locId = meterMap[row.meter_id].location_id;
          addToLoc(locId, mk, toWh(row.total_value, row.meter_id));
        }
      }

      // Fetch degree days (single call, ref location)
      const refLocation = locations[0];
      const { data: sessionData } = await supabase.auth.getSession();
      let validToken = sessionData?.session?.access_token;
      if (!validToken) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        validToken = refreshed.session?.access_token;
        if (!validToken) throw new Error("Nicht authentifiziert – bitte neu anmelden");
      }

      const params = new URLSearchParams({
        latitude: String(refLocation.latitude),
        longitude: String(refLocation.longitude),
        start_date: startDate,
        end_date: endDate,
        location_id: refLocation.id,
        tenant_id: tenant.id,
        reference_temperature: String(referenceTemperature),
      });

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weather-degree-days?${params}`,
        {
          headers: {
            Authorization: `Bearer ${validToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      );
      if (!res.ok) throw new Error(`Gradtage-Abfrage fehlgeschlagen: ${res.status}`);
      const degreeDays: DegreeDayData[] = await res.json();

      // Compute WW baseline per location (only for heat energy types)
      const applyHotWater = isHeatType(energyType);
      const wwPerLoc: Record<string, { perMonthWh: number; source: HotWaterSource }> = {};
      const wwInfoList: LocationHotWaterInfo[] = [];
      for (const loc of locations) {
        if (!applyHotWater) {
          wwPerLoc[loc.id] = { perMonthWh: 0, source: "none" };
          continue;
        }
        const monthly = degreeDays.map((dd) => ({
          kwh: (perLoc[loc.id]?.[dd.month] || 0) / 1000, // Wh → kWh
          hdd: dd.heating_degree_days,
        }));
        const est = estimateHotWaterBaselineKwhPerMonth(monthly, {
          hotWaterViaGas: loc.hot_water_via_gas,
          hotWaterGasKwhYear: loc.hot_water_gas_kwh_year,
          hotWaterGasSharePct: loc.hot_water_gas_share_pct,
        });
        wwPerLoc[loc.id] = { perMonthWh: est.perMonthKwh * 1000, source: est.source };
        wwInfoList.push({
          locationId: loc.id,
          source: est.source,
          perMonthKwh: est.perMonthKwh,
        });
      }
      setHotWaterInfo(wwInfoList);

      const referenceHDDPerMonth = DEFAULT_REFERENCE_HDD_YEAR / 12;

      // Build per-month aggregated result across locations, normalizing each
      // location's heating share separately (temperature-independent WW is
      // subtracted before and added back after HDD scaling).
      const result: NormalizedConsumption[] = degreeDays.map((dd) => {
        const hdd = dd.heating_degree_days;
        const monthIndex = new Date(dd.month).getMonth();

        let actualSum = 0;
        let normalizedSum = 0;
        let wwSum = 0;

        for (const loc of locations) {
          const actualWh = perLoc[loc.id]?.[dd.month] || 0;
          if (actualWh <= 0) continue;
          const wwWh = Math.min(wwPerLoc[loc.id]?.perMonthWh || 0, actualWh);
          const heatingWh = actualWh - wwWh;
          let heatingNormWh: number;
          if (hdd > 0) {
            heatingNormWh = (heatingWh / hdd) * referenceHDDPerMonth;
          } else {
            heatingNormWh = heatingWh;
          }
          actualSum += actualWh;
          normalizedSum += heatingNormWh + wwWh;
          wwSum += wwWh;
        }

        const normalized = Math.round(normalizedSum * 100) / 100;
        const deviation =
          actualSum > 0
            ? Math.round(((normalized - actualSum) / actualSum) * 10000) / 100
            : 0;

        return {
          month: dd.month,
          monthLabel: MONTH_LABELS[monthIndex] || dd.month,
          actualConsumption: actualSum,
          degreeDays: hdd,
          avgTemperature: dd.avg_temperature,
          normalizedConsumption: normalized,
          deviationPercent: deviation,
          hotWaterConsumption: wwSum,
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
  const totalHotWater = data.reduce((s, d) => s + d.hotWaterConsumption, 0);
  const totalDeviation = totalActual > 0
    ? Math.round(((totalNormalized - totalActual) / totalActual) * 10000) / 100
    : 0;

  // Aggregated source label: manual wins, else summer-baseline if any, else fallback
  const overallHotWaterSource: HotWaterSource =
    hotWaterInfo.some((h) => h.source === "manual")
      ? "manual"
      : hotWaterInfo.some((h) => h.source === "summer-baseline")
        ? "summer-baseline"
        : hotWaterInfo.some((h) => h.source === "fallback")
          ? "fallback"
          : "none";

  return {
    data,
    loading,
    error,
    totalActual,
    totalNormalized,
    totalHotWater,
    totalDeviation,
    hotWaterInfo,
    hotWaterSource: overallHotWaterSource,
    refetch: fetchData,
    hasData: data.some((d) => d.actualConsumption > 0),
  };
}

