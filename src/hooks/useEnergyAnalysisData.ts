import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPowerSeriesAuto } from "@/lib/powerSeries";
import { useTenant } from "@/hooks/useTenant";
import type { Resolution } from "@/lib/energyAnalysisState";

export type ConcreteResolution = Exclude<Resolution, "auto">;

export interface EAPoint { t: number; v: number; max?: number }
export interface EASeries {
  meterId: string;
  label: string;
  unit: string;
  kind: "meter" | "sensor";
  locationId: string | null;
  points: EAPoint[];
}

const SENSOR_UNITS = new Set(["°c", "%", "v", "a", "hz", "ppm", "lux", "bar", "pa", "hpa", "bool", "on/off", "an/aus", "rh"]);

export function bucketStart(t: number, res: ConcreteResolution): number {
  const d = new Date(t);
  switch (res) {
    case "5min": d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0); break;
    case "hour": d.setMinutes(0, 0, 0); break;
    case "day": d.setHours(0, 0, 0, 0); break;
    case "week": { d.setHours(0, 0, 0, 0); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); break; }
    case "month": d.setHours(0, 0, 0, 0); d.setDate(1); break;
  }
  return d.getTime();
}

const PTS_PER_DAY: Record<ConcreteResolution, number> = { "5min": 288, hour: 24, day: 24, week: 24, month: 1 };

function energyUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === "kw" || u === "kwh") return "kWh";
  if (u === "w" || u === "wh") return "Wh";
  if (u === "m³/h" || u === "m3/h" || u === "m³" || u === "m3") return "m³";
  return unit;
}
function powerUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === "kwh") return "kW";
  if (u === "m³" || u === "m3") return "m³/h";
  return unit;
}

/**
 * Lädt Zeitreihen für die Energieanalyse und aggregiert sie clientseitig
 * auf die gewünschte Auflösung. Nutzt nur bestehende, RLS-geschützte Quellen
 * (get_power_series_auto, sensor_readings_5min/hourly) mit begrenzter Punktzahl.
 */
export function useEnergyAnalysisData(
  meterIds: string[],
  range: { from: Date; to: Date } | null,
  res: ConcreteResolution,
  quantity: "energy" | "power",
) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["energy-analysis", tenant?.id, meterIds, range?.from.toISOString(), range?.to.toISOString(), res, quantity],
    enabled: !!tenant?.id && !!range && meterIds.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ series: EASeries[]; missing: string[] }> => {
      const { from, to } = range!;
      const { data: meters, error } = await supabase
        .from("meters")
        .select("id, name, unit, source_unit_power, device_type, location_id")
        .eq("tenant_id", tenant!.id)
        .in("id", meterIds);
      if (error) throw error;
      const byId = new Map((meters ?? []).map((m: any) => [m.id, m]));
      const missing = meterIds.filter((id) => !byId.has(id));

      const isSensor = (m: any) =>
        m.device_type === "sensor" || m.device_type === "actuator" ||
        SENSOR_UNITS.has(String(m.unit ?? m.source_unit_power ?? "").trim().toLowerCase());

      const meterRows = meterIds.filter((id) => byId.has(id) && !isSensor(byId.get(id)));
      const sensorRows = meterIds.filter((id) => byId.has(id) && isSensor(byId.get(id)));
      const days = Math.max(1, (to.getTime() - from.getTime()) / 86_400_000);
      const maxPoints = Math.min(20000, Math.ceil(days * PTS_PER_DAY[res]));

      const power = meterRows.length ? await fetchPowerSeriesAuto(meterRows, from, to, maxPoints) : [];

      const series: EASeries[] = [];
      for (const id of meterRows) {
        const m: any = byId.get(id);
        const rawUnit = String(m.source_unit_power ?? m.unit ?? "kW");
        const buckets = new Map<number, { e: number; sum: number; n: number; max: number }>();
        for (const p of power) {
          if (p.meter_id !== id) continue;
          const t = new Date(p.bucket).getTime();
          if (t < from.getTime() || t >= to.getTime()) continue;
          const k = bucketStart(t, res);
          const b = buckets.get(k) ?? { e: 0, sum: 0, n: 0, max: -Infinity };
          b.e += p.power_avg * (p.resolution_minutes / 60);
          b.sum += p.power_avg; b.n += 1;
          b.max = Math.max(b.max, p.power_max ?? p.power_avg);
          buckets.set(k, b);
        }
        const points = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([t, b]) => ({
          t, v: quantity === "energy" ? b.e : b.sum / b.n, max: b.max,
        }));
        series.push({
          meterId: id, label: m.name, kind: "meter", locationId: m.location_id,
          unit: quantity === "energy" ? energyUnit(rawUnit) : powerUnit(rawUnit), points,
        });
      }

      for (const id of sensorRows) {
        const m: any = byId.get(id);
        const fine = res === "5min" && days <= 3;
        const table = fine ? "sensor_readings_5min" : "sensor_readings_hourly";
        const col = fine ? "value_avg" : "value_twavg";
        const { data } = await (supabase as any)
          .from(table).select(`bucket, ${col}`).eq("meter_id", id)
          .gte("bucket", from.toISOString()).lt("bucket", to.toISOString())
          .order("bucket", { ascending: true }).limit(10000);
        const buckets = new Map<number, { sum: number; n: number; max: number }>();
        for (const r of (data ?? []) as any[]) {
          const v = Number(r[col]);
          if (!Number.isFinite(v)) continue;
          const k = bucketStart(new Date(r.bucket).getTime(), res);
          const b = buckets.get(k) ?? { sum: 0, n: 0, max: -Infinity };
          b.sum += v; b.n += 1; b.max = Math.max(b.max, v);
          buckets.set(k, b);
        }
        series.push({
          meterId: id, label: m.name, kind: "sensor", locationId: m.location_id,
          unit: String(m.unit ?? ""),
          points: Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t, v: b.sum / b.n, max: b.max })),
        });
      }

      // Reihenfolge wie ausgewählt
      series.sort((a, b) => meterIds.indexOf(a.meterId) - meterIds.indexOf(b.meterId));
      return { series, missing };
    },
  });
}

/** Heizgradtage je Tag (20/15) über Open-Meteo-Archiv. */
export async function fetchHeatingDegreeDays(lat: number, lon: number, from: Date, to: Date): Promise<Map<string, number>> {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const end = new Date(Math.min(to.getTime() - 1, Date.now() - 86_400_000 * 2));
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${iso(from)}&end_date=${iso(end)}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Wetterdaten nicht verfügbar");
  const json = await res.json();
  const out = new Map<string, number>();
  (json?.daily?.time ?? []).forEach((d: string, i: number) => {
    const tm = Number(json.daily.temperature_2m_mean[i]);
    out.set(d, Number.isFinite(tm) && tm < 15 ? 20 - tm : 0);
  });
  return out;
}
