import { supabase } from "@/integrations/supabase/client";
import { fetchPowerSeriesAuto } from "@/lib/powerSeries";


export type MeterPowerReading = {
  power_value: number;
  recorded_at: string;
};

export type PvForecastWeightHour = {
  timestamp: string;
  estimated_kwh?: number | null;
  ai_adjusted_kwh?: number | null;
};

export type PvActualHourlyState = {
  readings: Record<string, number>;
  isEstimated: boolean;
  isStored: boolean;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function toLocalHourKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}`;
}

export function toLocalDateKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getReadingIntervalMinutes(readings: MeterPowerReading[], index: number) {
  if (index < readings.length - 1) {
    const gap = (new Date(readings[index + 1].recorded_at).getTime() - new Date(readings[index].recorded_at).getTime()) / 60000;
    if (gap > 0 && gap <= 15) return gap;
  }

  return 5;
}

export async function fetchMeterPowerReadings(meterIds: string[], rangeStart: Date, rangeEnd: Date) {
  const allData: MeterPowerReading[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data: page } = await supabase
      .from("meter_power_readings")
      .select("power_value, recorded_at")
      .in("meter_id", meterIds)
      .gte("recorded_at", rangeStart.toISOString())
      .lt("recorded_at", rangeEnd.toISOString())
      .order("recorded_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (!page || page.length === 0) break;
    allData.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return allData.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

// Fallback for meters that only receive worker-aggregated 5-min buckets
// (no rows in meter_power_readings). Maps 5-min buckets to the same shape
// as fetchMeterPowerReadings so downstream aggregation (buildHourlyActuals)
// stays unchanged. Interval per sample is 5 minutes → energy = power_avg × 5/60.
export async function fetchMeterPower5min(meterIds: string[], rangeStart: Date, rangeEnd: Date) {
  const allData: MeterPowerReading[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data: page } = await supabase
      .from("meter_power_readings_5min")
      .select("power_avg, bucket")
      .in("meter_id", meterIds)
      .gte("bucket", rangeStart.toISOString())
      .lt("bucket", rangeEnd.toISOString())
      .order("bucket", { ascending: true })
      .range(from, from + pageSize - 1);

    if (!page || page.length === 0) break;
    for (const row of page as any[]) {
      if (row.power_avg == null) continue;
      allData.push({ power_value: Number(row.power_avg), recorded_at: row.bucket });
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return allData.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

/**
 * Primary hourly source: aggregate power series (`get_power_series_auto`).
 * Each bucket carries its own resolution, so energy = |power_avg| × res/60.
 * Values are returned as positive absolutes (PV yield convention).
 *
 * Zusätzlich wird pro Stunde die tatsächlich durch Messdaten abgedeckte
 * Minutenzahl ermittelt (max. über alle Zähler). Nur Stunden mit
 * unvollständiger Deckung dürfen später auf die Tagessumme hochgerechnet
 * werden — vollständig gemessene Stunden bleiben unverändert.
 */
export async function fetchHourlyActualsWithCoverage(
  meterIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ hourly: Record<string, number>; coverage: Record<string, number> }> {
  if (meterIds.length === 0 || rangeEnd <= rangeStart) return { hourly: {}, coverage: {} };

  const rows = await fetchPowerSeriesAuto(meterIds, rangeStart, rangeEnd, 2000);
  if (rows.length === 0) return { hourly: {}, coverage: {} };

  const hourBuckets: Record<string, number> = {};
  const coveragePerMeter: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    if (row.power_avg == null || !Number.isFinite(row.power_avg)) continue;
    const resolution = Number(row.resolution_minutes) > 0 ? Number(row.resolution_minutes) : 5;
    const hour = toLocalHourKey(row.bucket);
    hourBuckets[hour] = (hourBuckets[hour] ?? 0) + Math.abs(row.power_avg) * (resolution / 60);

    const perHour = (coveragePerMeter[row.meter_id] ??= {});
    perHour[hour] = Math.min(60, (perHour[hour] ?? 0) + resolution);
  }

  const coverage: Record<string, number> = {};
  for (const perHour of Object.values(coveragePerMeter)) {
    for (const [hour, minutes] of Object.entries(perHour)) {
      coverage[hour] = Math.max(coverage[hour] ?? 0, minutes);
    }
  }

  return {
    hourly: Object.fromEntries(
      Object.entries(hourBuckets).map(([hour, kwh]) => [hour, round2(kwh)])
    ),
    coverage,
  };
}

export async function fetchHourlyActualsFromSeries(
  meterIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Record<string, number>> {
  const { hourly } = await fetchHourlyActualsWithCoverage(meterIds, rangeStart, rangeEnd);
  return hourly;
}

/**
 * Stunden, die (teilweise) aus dem Gateway-Speicher nachgetragen wurden.
 * Deren Abtastrate ist grob (Loxone speichert oft nur alle 30 Minuten einen
 * Wert), deshalb dürfen genau diese Stunden gegen die autoritative
 * Tagessumme abgeglichen werden — live gemessene Stunden nicht.
 */
export async function fetchBackfilledHours(
  meterIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Set<string>> {
  const hours = new Set<string>();
  if (meterIds.length === 0 || rangeEnd <= rangeStart) return hours;

  const { data, error } = await supabase
    .from("meter_power_readings_5min")
    .select("bucket, source")
    .in("meter_id", meterIds)
    .gte("bucket", rangeStart.toISOString())
    .lt("bucket", rangeEnd.toISOString())
    .in("source", ["gateway_backfill", "loxone_backfill"])
    .limit(1000);

  if (error) {
    console.error("fetchBackfilledHours error:", error);
    return hours;
  }

  for (const row of (data ?? []) as Array<{ bucket: string }>) {
    hours.add(toLocalHourKey(row.bucket));
  }
  return hours;
}




export function buildHourlyActuals(readings: MeterPowerReading[]) {
  const hourBuckets: Record<string, number> = {};

  for (let index = 0; index < readings.length; index += 1) {
    const reading = readings[index];
    const hour = toLocalHourKey(reading.recorded_at);
    const intervalMin = getReadingIntervalMinutes(readings, index);
    const energyKwh = reading.power_value * (intervalMin / 60);
    hourBuckets[hour] = (hourBuckets[hour] ?? 0) + energyKwh;
  }

  return Object.fromEntries(
    Object.entries(hourBuckets).map(([hour, kwh]) => [hour, round2(kwh)])
  );
}

export function buildDailyActualTotal(readings: MeterPowerReading[]) {
  const totalKwh = readings.reduce((sum, reading, index) => {
    const intervalMin = getReadingIntervalMinutes(readings, index);
    return sum + reading.power_value * (intervalMin / 60);
  }, 0);

  return Math.round(totalKwh * 10) / 10;
}

function buildDefaultHourlyWeights(dayStr: string) {
  return Array.from({ length: 24 }, (_, hour) => {
    const sun = hour >= 6 && hour <= 19 ? Math.sin(((hour - 6) / 13) * Math.PI) : 0;
    return {
      timestamp: `${dayStr}T${String(hour).padStart(2, "0")}:00:00`,
      weight: Math.max(0, sun),
    };
  });
}

export function estimateHourlyActualsFromDailyTotal(
  dayStr: string,
  dailyTotalKwh: number,
  forecastHours: Array<PvForecastWeightHour & { weight?: number }> = [],
) {
  const rawWeights = (forecastHours.length > 0 ? forecastHours : buildDefaultHourlyWeights(dayStr))
    .map((hour) => ({
      hourKey: toLocalHourKey(hour.timestamp),
      weight: hour.ai_adjusted_kwh != null && hour.ai_adjusted_kwh > 0
        ? hour.ai_adjusted_kwh
        : hour.estimated_kwh ?? hour.weight ?? 0,
    }))
    .filter((hour) => hour.hourKey.startsWith(dayStr));

  const aggregatedWeights = new Map<string, number>();
  for (const hour of rawWeights) {
    aggregatedWeights.set(hour.hourKey, (aggregatedWeights.get(hour.hourKey) ?? 0) + Math.max(0, hour.weight));
  }

  const weights = Array.from(aggregatedWeights.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hourKey, weight]) => ({ hourKey, weight }));

  const totalWeight = weights.reduce((sum, hour) => sum + hour.weight, 0);
  if (weights.length === 0 || totalWeight <= 0 || dailyTotalKwh <= 0) return {};

  let allocated = 0;
  return Object.fromEntries(
    weights.map((hour, index) => {
      const isLast = index === weights.length - 1;
      const value = isLast
        ? round2(dailyTotalKwh - allocated)
        : round2((dailyTotalKwh * hour.weight) / totalWeight);

      allocated += value;
      return [hour.hourKey, Math.max(0, value)];
    })
  );
}

type StoredHourlyActualRow = {
  hour_start: string;
  actual_kwh: number;
  source: string;
  coverage_minutes: number;
};

type StoredDailyActualRow = {
  day: string;
  actual_kwh: number;
};

async function fetchStoredHourlyActuals(
  locationId: string | null | undefined,
  tenantId: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date,
) {
  if (locationId) {
    const { data, error } = await supabase.rpc("get_pv_actual_hourly", {
      p_location_id: locationId,
      p_from: rangeStart.toISOString(),
      p_to: rangeEnd.toISOString(),
    });

    if (error) {
      console.error("get_pv_actual_hourly error:", error);
      return [] as StoredHourlyActualRow[];
    }

    return (data ?? []) as StoredHourlyActualRow[];
  }

  if (tenantId) {
    const api = supabase as any;
    const { data, error } = await api.rpc("get_pv_actual_hourly_all", {
      p_tenant_id: tenantId,
      p_from: rangeStart.toISOString(),
      p_to: rangeEnd.toISOString(),
    });

    if (error) {
      console.error("get_pv_actual_hourly_all error:", error);
      return [] as StoredHourlyActualRow[];
    }

    return ((data ?? []) as unknown[]) as StoredHourlyActualRow[];
  }

  return [] as StoredHourlyActualRow[];
}

async function fetchStoredDailyActuals(
  locationId: string | null | undefined,
  tenantId: string | null | undefined,
  fromDate: string,
  toDate: string,
) {
  if (locationId) {
    const { data, error } = await supabase.rpc("get_pv_actual_daily_sums", {
      p_location_id: locationId,
      p_from_date: fromDate,
      p_to_date: toDate,
    });

    if (error) {
      console.error("get_pv_actual_daily_sums error:", error);
      return [] as StoredDailyActualRow[];
    }

    return ((data ?? []) as unknown[]) as StoredDailyActualRow[];
  }

  if (tenantId) {
    const api = supabase as any;
    const { data, error } = await api.rpc("get_pv_actual_daily_sums_all", {
      p_tenant_id: tenantId,
      p_from_date: fromDate,
      p_to_date: toDate,
    });

    if (error) {
      console.error("get_pv_actual_daily_sums_all error:", error);
      return [] as StoredDailyActualRow[];
    }

    return ((data ?? []) as unknown[]) as StoredDailyActualRow[];
  }

  return [] as StoredDailyActualRow[];
}

async function fetchTodayCumulativeKwh(meterIds: string[]): Promise<number | null> {
  if (meterIds.length === 0) return null;
  const todayStr = toLocalDateKey(new Date());
  const { data, error } = await supabase
    .from("meter_period_totals")
    .select("total_value")
    .in("meter_id", meterIds)
    .eq("period_type", "day")
    .eq("period_start", todayStr);
  if (error) {
    console.error("fetchTodayCumulativeKwh error:", error);
    return null;
  }
  if (!data || data.length === 0) return null;
  const total = data.reduce((sum, row: any) => sum + Math.abs(Number(row.total_value ?? 0)), 0);
  return total > 0 ? total : null;
}

function scaleHourlyToTotal(hourly: Record<string, number>, target: number): Record<string, number> {
  const entries = Object.entries(hourly).sort(([a], [b]) => a.localeCompare(b));
  const sum = entries.reduce((s, [, v]) => s + Math.abs(v), 0);
  if (sum <= 0 || target <= 0) return hourly;
  const factor = target / sum;
  let allocated = 0;
  return Object.fromEntries(
    entries.map(([k, v], idx) => {
      const isLast = idx === entries.length - 1;
      const scaled = isLast ? round2(target - allocated) : round2(Math.abs(v) * factor);
      allocated += scaled;
      return [k, Math.max(0, scaled)];
    })
  );
}

const FULL_COVERAGE_MINUTES = 55; // 11 von 12 5-Minuten-Buckets gelten als vollständig

/**
 * Verteilt die Differenz zur autoritativen Tagessumme ausschließlich auf
 * Stunden mit unvollständiger Messabdeckung. Vollständig gemessene Stunden
 * bleiben exakt so, wie sie gemessen wurden (keine Verschmierung des
 * Defizits über den ganzen Tag).
 */
function reconcileHourlyWithCoverage(
  hourly: Record<string, number>,
  coverage: Record<string, number>,
  target: number,
): Record<string, number> {
  const entries = Object.entries(hourly).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0 || target <= 0) return hourly;

  const incomplete = entries.filter(([hour]) => (coverage[hour] ?? 0) < FULL_COVERAGE_MINUTES);
  if (incomplete.length === 0) return hourly;

  const completeSum = entries
    .filter(([hour]) => (coverage[hour] ?? 0) >= FULL_COVERAGE_MINUTES)
    .reduce((s, [, v]) => s + Math.abs(v), 0);
  const incompleteSum = incomplete.reduce((s, [, v]) => s + Math.abs(v), 0);
  const remaining = target - completeSum;

  // Nichts zu verteilen oder implausibel (gemessene Vollstunden liegen schon
  // über der Tagessumme) → Messwerte unverändert lassen.
  if (remaining <= 0 || incompleteSum <= 0) return hourly;

  const factor = remaining / incompleteSum;
  // Schutz gegen absurde Hochrechnungen (z. B. defekte Tagessumme)
  if (!Number.isFinite(factor) || factor > 24) return hourly;

  const result: Record<string, number> = {};
  for (const [hour, value] of entries) {
    const isIncomplete = (coverage[hour] ?? 0) < FULL_COVERAGE_MINUTES;
    result[hour] = isIncomplete ? round2(Math.abs(value) * factor) : round2(Math.abs(value));
  }
  return result;
}


export async function fetchPvActualHourly({
  meterIds,
  locationId,
  tenantId,
  rangeStart,
  rangeEnd,
  forecastHours = [],
}: {
  meterIds: string[];
  locationId?: string | null;
  tenantId?: string | null;
  rangeStart: Date;
  rangeEnd: Date;
  forecastHours?: PvForecastWeightHour[];
}): Promise<PvActualHourlyState> {
  if (meterIds.length === 0) {
    return { readings: {}, isEstimated: false, isStored: false };
  }

  const dayStr = toLocalDateKey(rangeStart);
  const todayStr = toLocalDateKey(new Date());
  const isToday = dayStr === todayStr;

  // For today, never fabricate values for hours that haven't happened yet.
  // Both the raw fetch window and the forecast-weight distribution must stop at "now".
  const now = new Date();
  const effectiveEnd = isToday && now < rangeEnd ? now : rangeEnd;
  const currentHourKey = toLocalHourKey(now.toISOString());
  const clippedForecast = isToday
    ? forecastHours.filter((h) => toLocalHourKey(h.timestamp) <= currentHourKey)
    : forecastHours;

  // Primary source: zoom-aware aggregate series (5/15/60-min buckets).
  // The legacy raw table `meter_power_readings` is no longer written for
  // worker-aggregated meters, so it must never be the primary series source —
  // a single leftover raw row would collapse the whole day into one hour.
  const { hourly: seriesHourly, coverage } = await fetchHourlyActualsWithCoverage(
    meterIds,
    rangeStart,
    effectiveEnd,
  );
  let hourly = seriesHourly;
  let hourlyCoverage = coverage;

  if (Object.keys(hourly).length === 0) {
    const rawReadings = await fetchMeterPowerReadings(meterIds, rangeStart, effectiveEnd);
    if (rawReadings.length > 1) {
      hourly = buildHourlyActuals(rawReadings);
      hourlyCoverage = {};
    }
  }

  if (Object.keys(hourly).length > 0) {
    if (isToday) {
      const authoritative = await fetchTodayCumulativeKwh(meterIds);
      if (authoritative != null) {
        const sum = Object.values(hourly).reduce((s, v) => s + Math.abs(v), 0);
        const coveredHours = Object.values(hourly).filter((v) => Math.abs(v) > 0).length;
        const hasCoverageInfo = Object.keys(hourlyCoverage).length > 0;
        if (sum > 0 && coveredHours >= 2) {
          // Bevorzugt: Abgleich nur auf Stunden mit Messlücken, damit
          // vollständig gemessene Stunden exakt bleiben.
          hourly = hasCoverageInfo
            ? reconcileHourlyWithCoverage(hourly, hourlyCoverage, authoritative)
            : scaleHourlyToTotal(hourly, authoritative);
        } else if (sum <= 0) {
          hourly = estimateHourlyActualsFromDailyTotal(dayStr, authoritative, clippedForecast);
        }
      }
    }
    return { readings: hourly, isEstimated: false, isStored: false };
  }




  if (isToday) {
    const authoritative = await fetchTodayCumulativeKwh(meterIds);
    if (authoritative != null) {
      return {
        readings: estimateHourlyActualsFromDailyTotal(dayStr, authoritative, clippedForecast),
        isEstimated: true,
        isStored: false,
      };
    }
  }

  const storedRows = await fetchStoredHourlyActuals(locationId, tenantId, rangeStart, rangeEnd);
  if (storedRows.length > 0) {
    return {
      readings: Object.fromEntries(
        storedRows.map((row) => [toLocalHourKey(row.hour_start), round2(row.actual_kwh ?? 0)])
      ),
      isEstimated: false,
      isStored: true,
    };
  }

  if (dayStr >= todayStr) {
    return { readings: {}, isEstimated: false, isStored: false };
  }

  const { data, error } = await supabase.rpc("get_meter_daily_totals", {
    p_meter_ids: meterIds,
    p_from_date: dayStr,
    p_to_date: dayStr,
  });

  if (error || !data || data.length === 0) {
    if (error) console.error("get_meter_daily_totals error:", error);
    return { readings: {}, isEstimated: false, isStored: false };
  }

  const dailyTotal = data.reduce((sum, row) => sum + (row.total_value ?? 0), 0);
  if (dailyTotal <= 0) {
    return { readings: {}, isEstimated: false, isStored: false };
  }

  return {
    readings: estimateHourlyActualsFromDailyTotal(dayStr, dailyTotal, forecastHours),
    isEstimated: true,
    isStored: false,
  };
}


export async function fetchPvActualDailyTotals({
  meterIds,
  locationId,
  tenantId,
  rangeStart,
  rangeEnd,
}: {
  meterIds: string[];
  locationId?: string | null;
  tenantId?: string | null;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  if (meterIds.length === 0) return {} as Record<string, number>;

  const fromDate = toLocalDateKey(rangeStart);
  const toDate = toLocalDateKey(new Date(rangeEnd.getTime() - 1));
  const dayMap: Record<string, number> = {};

  const storedRows = await fetchStoredDailyActuals(locationId, tenantId, fromDate, toDate);
  for (const row of storedRows) {
    dayMap[String(row.day)] = (dayMap[String(row.day)] ?? 0) + (row.actual_kwh ?? 0);
  }

  const { data, error } = await supabase.rpc("get_meter_daily_totals", {
    p_meter_ids: meterIds,
    p_from_date: fromDate,
    p_to_date: toDate,
  });

  if (!error && data) {
    for (const row of data) {
      const dayKey = String(row.day);
      if (dayMap[dayKey] == null) {
        dayMap[dayKey] = (dayMap[dayKey] ?? 0) + (row.total_value ?? 0);
      }
    }
  } else if (error) {
    console.error("get_meter_daily_totals error:", error);
  }

  const today = new Date();
  const todayStr = toLocalDateKey(today);
  if (todayStr >= fromDate && todayStr <= toDate) {
    const authoritative = await fetchTodayCumulativeKwh(meterIds);
    if (authoritative != null) {
      dayMap[todayStr] = authoritative;
    } else {
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const rawTodayReadings = await fetchMeterPowerReadings(meterIds, todayStart, todayEnd);
      const todayReadings = rawTodayReadings.length > 0
        ? rawTodayReadings
        : await fetchMeterPower5min(meterIds, todayStart, todayEnd);
      if (todayReadings.length > 0) {
        dayMap[todayStr] = buildDailyActualTotal(todayReadings);
      }

    }
  }


  return dayMap;
}
