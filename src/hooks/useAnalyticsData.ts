import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPowerSeriesAuto } from "@/lib/powerSeries";

import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { de } from "date-fns/locale";

export type AnalyticsPeriod = "day" | "week" | "month" | "quarter" | "year" | "custom";

export interface AnalyticsRange {
  from: Date;
  to: Date;
  period: AnalyticsPeriod;
}

export interface AnalyticsPoint {
  t: number; // epoch ms
  v: number;
  label: string;
}

export interface AnalyticsSeries {
  meterId: string;
  label: string;
  unit: string;
  data: AnalyticsPoint[];
}

const SENSOR_UNITS = new Set(["°c", "°c", "%", "v", "a", "hz", "ppm", "lux", "bar", "pa", "hpa", "bool", "on/off", "an/aus", "rh"]);

function isSensorUnit(unit?: string | null): boolean {
  if (!unit) return false;
  return SENSOR_UNITS.has(unit.trim().toLowerCase());
}

function getRangeForPeriod(period: AnalyticsPeriod, offset = 0): { from: Date; to: Date } {
  const now = new Date();
  switch (period) {
    case "day": {
      const base = new Date(now);
      base.setDate(base.getDate() + offset);
      return { from: startOfDay(base), to: endOfDay(base) };
    }
    case "week": {
      const base = new Date(now);
      base.setDate(base.getDate() + offset * 7);
      return { from: startOfWeek(base, { locale: de, weekStartsOn: 1 }), to: endOfWeek(base, { locale: de, weekStartsOn: 1 }) };
    }
    case "month": {
      const base = new Date(now);
      base.setMonth(base.getMonth() + offset);
      return { from: startOfMonth(base), to: endOfMonth(base) };
    }
    case "quarter": {
      const base = new Date(now);
      base.setMonth(base.getMonth() + offset * 3);
      const q = Math.floor(base.getMonth() / 3);
      const from = new Date(base.getFullYear(), q * 3, 1);
      const to = new Date(base.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
      return { from, to };
    }
    case "year": {
      const base = new Date(now);
      base.setFullYear(base.getFullYear() + offset);
      return { from: startOfYear(base), to: endOfYear(base) };
    }
    case "custom":
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

function formatLabel(d: Date, period: AnalyticsPeriod): string {
  switch (period) {
    case "day":
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    case "week":
      return d.toLocaleDateString("de-DE", { weekday: "short" });
    case "month":
    case "quarter":
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    case "year":
      return d.toLocaleDateString("de-DE", { month: "short" });
    default:
      return d.toLocaleString("de-DE");
  }
}

export function useAnalyticsData(
  meterIds: string[],
  period: AnalyticsPeriod,
  customRange?: { from: Date; to: Date },
  enabled = true,
  offset = 0,
) {
  const range = customRange ?? getRangeForPeriod(period, offset);

  return useQuery({
    queryKey: ["analytics-data", meterIds, period, offset, range.from.toISOString(), range.to.toISOString()],
    enabled: enabled && meterIds.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AnalyticsSeries[]> => {
      const fromIso = range.from.toISOString();
      const toIso = range.to.toISOString();

      // Fetch meter details
      const { data: meterDetails, error: mdErr } = await supabase
        .from("meters")
        .select("id, name, unit, source_unit_power, energy_type, capture_type, device_type")
        .in("id", meterIds);
      if (mdErr) throw mdErr;

      const detailMap = Object.fromEntries((meterDetails ?? []).map((m: any) => [m.id, m]));

      const series: AnalyticsSeries[] = [];

      for (const meterId of meterIds) {
        const detail = detailMap[meterId];
        if (!detail) continue;

        const isSensor = detail.device_type === "sensor" || detail.device_type === "actuator" || isSensorUnit(detail.unit ?? detail.source_unit_power);
        const label = detail.name;
        const unit = (detail.unit ?? detail.source_unit_power ?? "kW").toString().trim();

        let points: AnalyticsPoint[] = [];

        if (isSensor) {
          if (period === "day") {
            // Try raw first, fallback to 5min
            const { data: raw } = await supabase
              .from("sensor_readings_raw")
              .select("recorded_at, value")
              .eq("meter_id", meterId)
              .gte("recorded_at", fromIso)
              .lte("recorded_at", toIso)
              .order("recorded_at", { ascending: true })
              .limit(3000);
            if (raw && raw.length > 0) {
              points = raw.map((r: any) => ({
                t: new Date(r.recorded_at).getTime(),
                v: Number(r.value),
                label: formatLabel(new Date(r.recorded_at), period),
              }));
            } else {
              const { data: agg } = await supabase
                .from("sensor_readings_5min")
                .select("bucket, value_avg")
                .eq("meter_id", meterId)
                .gte("bucket", fromIso)
                .lte("bucket", toIso)
                .order("bucket", { ascending: true })
                .limit(3000);
              points = (agg ?? []).map((r: any) => ({
                t: new Date(r.bucket).getTime(),
                v: Number(r.value_avg),
                label: formatLabel(new Date(r.bucket), period),
              }));
            }
          } else if (period === "week") {
            const { data: agg } = await supabase
              .from("sensor_readings_5min")
              .select("bucket, value_avg")
              .eq("meter_id", meterId)
              .gte("bucket", fromIso)
              .lte("bucket", toIso)
              .order("bucket", { ascending: true })
              .limit(5000);
            points = (agg ?? []).map((r: any) => ({
              t: new Date(r.bucket).getTime(),
              v: Number(r.value_avg),
              label: formatLabel(new Date(r.bucket), period),
            }));
          } else {
            const table = period === "year" ? "sensor_readings_daily" : "sensor_readings_hourly";
            const valueCol = period === "year" ? "value_twavg" : "value_twavg";
            const { data: agg } = await (supabase as any)
              .from(table)
              .select(`bucket, ${valueCol}`)
              .eq("meter_id", meterId)
              .gte("bucket", period === "year" ? fromIso.slice(0, 10) : fromIso)
              .lte("bucket", period === "year" ? toIso.slice(0, 10) : toIso)
              .order("bucket", { ascending: true })
              .limit(5000);
            points = (agg ?? []).map((r: any) => ({
              t: new Date(r.bucket).getTime(),
              v: Number(r[valueCol]),
              label: formatLabel(new Date(r.bucket), period),
            }));
          }
        } else {
          // Power/energy meters
          const spanDays = (range.to.getTime() - range.from.getTime()) / 86_400_000;
          const usePowerCurve = period === "day" || (period === "custom" && spanDays <= 14);

          if (usePowerCurve) {
            // Zoom-aware: 5-min detail for short windows, 15-min for up to 14 days
            const rows = await fetchPowerSeriesAuto([meterId], range.from, range.to, 900);
            points = rows.map((r) => ({
              t: new Date(r.bucket).getTime(),
              v: r.power_avg,
              label: formatLabel(new Date(r.bucket), period),
            }));
          } else {
            const fromDate = format(range.from, "yyyy-MM-dd");
            const toDate = format(range.to, "yyyy-MM-dd");
            const { data: agg } = await supabase.rpc("get_meter_daily_totals_split_with_fallback" as any, {
              p_meter_ids: [meterId],
              p_from_date: fromDate,
              p_to_date: toDate,
            });
            points = (agg ?? []).map((r: any) => ({
              t: new Date(r.day).getTime(),
              v: Number(r.bezug) - Number(r.einspeisung),
              label: formatLabel(new Date(r.day), period),
            }));
          }
        }


        series.push({ meterId, label, unit, data: points });
      }

      return series;
    },
  });
}
