import { supabase } from "@/integrations/supabase/client";

export type MeterPowerReading = {
  power_value: number;
  recorded_at: string;
};

export function toLocalHourKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}`;
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
    Object.entries(hourBuckets).map(([hour, kwh]) => [hour, Math.round(kwh * 100) / 100])
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
  forecastHours: Array<{ timestamp: string; estimated_kwh?: number | null; ai_adjusted_kwh?: number | null }> = [],
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
        ? Math.round((dailyTotalKwh - allocated) * 100) / 100
        : Math.round(((dailyTotalKwh * hour.weight) / totalWeight) * 100) / 100;

      allocated += value;
      return [hour.hourKey, Math.max(0, value)];
    })
  );
}
