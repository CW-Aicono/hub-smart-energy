import { supabase } from "@/integrations/supabase/client";

export interface PowerSeriesPoint {
  meter_id: string;
  bucket: string;
  power_avg: number;
  power_max: number | null;
  resolution_minutes: number;
}

/**
 * Zoom-aware power series loader.
 *
 * Calls the server-side function `get_power_series_auto`, which picks the
 * resolution based on the requested time window (5 min / 15 min / 1 h / 1 day)
 * and caps the number of points per meter. This keeps 5-minute detail available
 * for short windows without ever transferring huge result sets for long ranges.
 *
 * Falls back to the legacy `get_power_readings_5min` RPC if the new function is
 * unavailable (e.g. during rollout).
 */
export async function fetchPowerSeriesAuto(
  meterIds: string[],
  start: Date | string,
  end: Date | string,
  maxPoints = 800,
): Promise<PowerSeriesPoint[]> {
  if (!meterIds.length) return [];
  const p_start = typeof start === "string" ? start : start.toISOString();
  const p_end = typeof end === "string" ? end : end.toISOString();

  const { data, error } = await supabase.rpc("get_power_series_auto", {
    p_meter_ids: meterIds,
    p_start,
    p_end,
    p_max_points: maxPoints,
  });

  if (!error && data) {
    return (data as any[]).map((r) => ({
      meter_id: r.meter_id,
      bucket: r.bucket,
      power_avg: Number(r.power_avg),
      power_max: r.power_max == null ? null : Number(r.power_max),
      resolution_minutes: Number(r.resolution_minutes ?? 5),
    }));
  }

  console.warn("get_power_series_auto failed, falling back:", error);

  const { data: legacy, error: legacyError } = await supabase.rpc("get_power_readings_5min", {
    p_meter_ids: meterIds,
    p_start,
    p_end,
  });
  if (legacyError) {
    console.warn("get_power_readings_5min error:", legacyError);
    return [];
  }
  return (legacy ?? []).map((r: any) => ({
    meter_id: r.meter_id,
    bucket: r.bucket,
    power_avg: Number(r.power_avg),
    power_max: null,
    resolution_minutes: 5,
  }));
}
