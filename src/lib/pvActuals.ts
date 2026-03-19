import { supabase } from "@/integrations/supabase/client";

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

  const rawReadings = await fetchMeterPowerReadings(meterIds, rangeStart, rangeEnd);
  if (rawReadings.length > 0) {
    return { readings: buildHourlyActuals(rawReadings), isEstimated: false, isStored: false };
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

  const dayStr = toLocalDateKey(rangeStart);
  const todayStr = toLocalDateKey(new Date());
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
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todayReadings = await fetchMeterPowerReadings(meterIds, todayStart, todayEnd);
    if (todayReadings.length > 0) {
      dayMap[todayStr] = buildDailyActualTotal(todayReadings);
    }
  }

  return dayMap;
}
