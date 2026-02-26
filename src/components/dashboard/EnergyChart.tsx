import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useMeters } from "@/hooks/useMeters";
import { useLocations } from "@/hooks/useLocations";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ENERGY_CHART_COLORS, ENERGY_TYPE_LABELS } from "@/lib/energyTypeColors";
import { cn } from "@/lib/utils";
import { gasM3ToKWh } from "@/lib/formatEnergy";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  addDays, addWeeks, addMonths, addQuarters, addYears,
  eachDayOfInterval, getISOWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { useLocationEnergySources } from "@/hooks/useLocationEnergySources";

type ChartPeriod = "day" | "week" | "month" | "quarter" | "year";

const PERIOD_LABELS: Record<ChartPeriod, string> = {
  day: "Tag",
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
};

function getRefDate(period: ChartPeriod, offset: number): Date {
  const now = new Date();
  switch (period) {
    case "day": return addDays(now, offset);
    case "week": return addWeeks(now, offset);
    case "month": return addMonths(now, offset);
    case "quarter": return addQuarters(now, offset);
    case "year": return addYears(now, offset);
  }
}

function getPeriodRange(period: ChartPeriod, ref: Date, weekStartsOn: 0|1|2|3|4|5|6 = 1): [Date, Date] {
  switch (period) {
    case "day": return [startOfDay(ref), endOfDay(ref)];
    case "week": return [startOfWeek(ref, { weekStartsOn }), endOfWeek(ref, { weekStartsOn })];
    case "month": return [startOfMonth(ref), endOfMonth(ref)];
    case "quarter": return [startOfQuarter(ref), endOfQuarter(ref)];
    case "year": return [startOfYear(ref), endOfYear(ref)];
  }
}

function getPeriodLabel(period: ChartPeriod, ref: Date): string {
  switch (period) {
    case "day": return format(ref, "EEEE, d. MMM yyyy", { locale: de });
    case "week": return `KW ${getISOWeek(ref)}, ${format(ref, "yyyy")}`;
    case "month": return format(ref, "MMMM yyyy", { locale: de });
    case "quarter": {
      const q = Math.floor(ref.getMonth() / 3) + 1;
      return `Q${q} ${format(ref, "yyyy")}`;
    }
    case "year": return format(ref, "yyyy");
  }
}

function getUnitForPeriod(period: ChartPeriod, energyType: string): string {
  if (period === "day") {
    if (energyType === "wasser") return "Liter";
    return "kW";
  }
  if (energyType === "wasser") return "m³";
  return "kWh";
}

function getChartUnitLabel(period: ChartPeriod): string {
  return period === "day" ? "kW" : "kWh";
}

interface EnergyChartProps {
  locationId: string | null;
}

const ENERGY_KEYS = ["strom", "gas", "waerme", "wasser"] as const;
type EnergyKey = typeof ENERGY_KEYS[number];
type EnergyBucket = Record<EnergyKey, number>;
type EnergyBucketWithLabel = EnergyBucket & { label: string };
type DayBucket = EnergyBucket & { label: string; real_strom: number | null; real_gas: number | null; real_waerme: number | null; real_wasser: number | null };

/** Type-safe setter for energy bucket fields */
function addToEnergyBucket(bucket: EnergyBucket, key: string, value: number) {
  if (key in bucket && ENERGY_KEYS.includes(key as EnergyKey)) {
    bucket[key as EnergyKey] += value;
  }
}

function getEnergyValue(bucket: EnergyBucket, key: EnergyKey): number {
  return bucket[key];
}

function setEnergyValue(bucket: EnergyBucket, key: EnergyKey, value: number) {
  bucket[key] = value;
}

function setDayBucketReal(bucket: DayBucket, key: EnergyKey, value: number | null) {
  const realKey = `real_${key}` as keyof DayBucket;
  (bucket[realKey] as number | null) = value;
}

function getDayBucketReal(bucket: DayBucket, key: EnergyKey): number | null {
  const realKey = `real_${key}` as keyof DayBucket;
  return bucket[realKey] as number | null;
}

const EnergyChart = ({ locationId }: EnergyChartProps) => {
  const { locations } = useLocations();
  const { readings, livePeriodTotals, loading, hasData } = useEnergyData(locationId);
  const { meters } = useMeters();
  const { selectedPeriod, setSelectedPeriod } = useDashboardFilter();
  const [offset, setOffset] = useState(0);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [powerReadings, setPowerReadings] = useState<Array<{ meter_id: string; power_value: number; recorded_at: string }>>([]);
  const [powerLoading, setPowerLoading] = useState(false);
  const allowedTypes = useLocationEnergySources(locationId);
  const visibleEnergyKeys = useMemo(() => ENERGY_KEYS.filter(k => allowedTypes.has(k)), [allowedTypes]);

  // Map "all" to "year" for this chart
  const period: ChartPeriod = selectedPeriod === "all" ? "year" : selectedPeriod;

  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const subtitle = selectedLocation ? `Daten für: ${selectedLocation.name}` : "Alle Liegenschaften";

  const meterMap = useMemo(() => {
    const map: Record<string, { energy_type: string; capture_type: string; location_id: string; is_main_meter: boolean; unit: string; gas_type: string | null; brennwert: number | null; zustandszahl: number | null }> = {};
    meters.forEach((m) => { map[m.id] = { energy_type: m.energy_type, capture_type: m.capture_type, location_id: m.location_id, is_main_meter: m.is_main_meter, unit: m.unit, gas_type: m.gas_type ?? null, brennwert: m.brennwert ?? null, zustandszahl: m.zustandszahl ?? null }; });
    return map;
  }, [meters]);

  const refDate = getRefDate(period, offset);
  const weekStartsOn = useWeekStartDay();
  const [rangeStart, rangeEnd] = getPeriodRange(period, refDate, weekStartsOn);
  const periodLabel = getPeriodLabel(period, refDate);
  const canGoForward = offset < 0;

  // Fetch power readings from DB for day view
  // Strategy: Use server-side get_power_readings_5min function which automatically
  // aggregates raw data into 5min buckets when pre-aggregated data isn't available.
  // For today, supplement with raw data for the last 10 minutes (not yet aggregated).
  useEffect(() => {
    if (period !== "day") {
      setPowerReadings([]);
      return;
    }
    const fetchPower = async () => {
      setPowerLoading(true);
      const mainMeterIds = meters
        .filter(m => !m.is_archived && m.is_main_meter && m.capture_type === "automatic")
        .filter(m => !locationId || m.location_id === locationId)
        .map(m => m.id);

      if (mainMeterIds.length === 0) {
        setPowerReadings([]);
        setPowerLoading(false);
        return;
      }

      const isToday = offset === 0 && new Date().toDateString() === getRefDate("day", 0).toDateString();

      let allData: Array<{ meter_id: string; power_value: number; recorded_at: string }> = [];

      // Use server-side function with explicit pagination to avoid PostgREST's default 1000-row cap
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;
      let aggError: unknown = null;
      const aggregatedRows: Array<{ meter_id: string; power_avg: number; bucket: string }> = [];

      while (hasMore) {
        const { data: pageData, error: pageError } = await supabase
          .rpc("get_power_readings_5min", {
            p_meter_ids: mainMeterIds,
            p_start: rangeStart.toISOString(),
            p_end: rangeEnd.toISOString(),
          })
          .range(from, from + pageSize - 1);

        if (pageError) {
          aggError = pageError;
          break;
        }

        if (!pageData || pageData.length === 0) {
          hasMore = false;
          break;
        }

        aggregatedRows.push(...(pageData as Array<{ meter_id: string; power_avg: number; bucket: string }>));
        hasMore = pageData.length === pageSize;
        from += pageSize;
      }

      if (!aggError && aggregatedRows.length > 0) {
        allData = aggregatedRows.map((r) => ({
          meter_id: r.meter_id,
          power_value: r.power_avg,
          recorded_at: r.bucket,
        }));

        // For today: fetch raw data for the last 10 minutes (not yet in any aggregate)
        if (isToday) {
          const recentCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const { data: recentRaw } = await supabase
            .from("meter_power_readings")
            .select("meter_id, power_value, recorded_at")
            .in("meter_id", mainMeterIds)
            .gte("recorded_at", recentCutoff)
            .lte("recorded_at", rangeEnd.toISOString())
            .order("recorded_at", { ascending: true });

          if (recentRaw && recentRaw.length > 0) {
            const cutoffDate = new Date(recentCutoff);
            allData = allData.filter(r => new Date(r.recorded_at) < cutoffDate);
            allData = [...allData, ...recentRaw];
          }
        }
      } else {
        console.warn("get_power_readings_5min returned no data or error:", aggError);
      }

      setPowerReadings(allData);
      setPowerLoading(false);
    };
    fetchPower();
  }, [period, rangeStart.toISOString(), rangeEnd.toISOString(), meters, locationId, offset]);

  const chartData = useMemo(() => {
    // For non-day periods at offset 0, inject Loxone period totals for automatic main meters
    const isCurrentPeriod = offset === 0;
    const useLoxoneTotals = isCurrentPeriod && period !== "day" && Object.keys(livePeriodTotals).length > 0;

    // Determine which period total field to use
    const periodTotalKey = period === "week" ? "totalWeek" : period === "month" ? "totalMonth" : period === "year" ? "totalYear" : null;

    // For current period with Loxone totals (month/year only): show a single aggregated bar
    // Week is excluded here – it falls through to the 7-day breakdown below
    if (useLoxoneTotals && periodTotalKey && period !== "quarter" && period !== "week") {
      const totals = { strom: 0, gas: 0, waerme: 0, wasser: 0 };

      // Add Loxone period totals for automatic main meters only
      for (const [meterId, pt] of Object.entries(livePeriodTotals)) {
        const info = meterMap[meterId];
        if (!info || !info.is_main_meter) continue;
        if (locationId && info.location_id !== locationId) continue;
        const rawVal = pt[periodTotalKey as keyof typeof pt];
        if (rawVal != null && info.energy_type in totals) {
          const converted = info.energy_type === "gas" && info.unit === "m³" ? gasM3ToKWh(rawVal, info.gas_type, info.brennwert, info.zustandszahl) : rawVal;
          addToEnergyBucket(totals, info.energy_type, converted);
        }
      }

      // Add manual main meter readings for the period
      const [rs, re] = [rangeStart, rangeEnd];
      readings.forEach((r) => {
        const info = meterMap[r.meter_id];
        if (!info || info.capture_type === "automatic" || !info.is_main_meter) return;
        const d = new Date(r.reading_date);
        if (d >= rs && d <= re) {
          const converted = info.energy_type === "gas" && info.unit === "m³" ? gasM3ToKWh(r.value, info.gas_type, info.brennwert, info.zustandszahl) : r.value;
          addToEnergyBucket(totals, info.energy_type, converted);
        }
      });

      return [{ label: periodLabel, ...totals }];
    }

    // Quarter with Loxone totals: use totalMonth for current period
    if (useLoxoneTotals && period === "quarter") {
      const monthLabels = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
      const startMonth = rangeStart.getMonth();
      const buckets = [0, 1, 2].map((i) => {
        const monthIdx = startMonth + i;
        return { label: monthLabels[monthIdx] || `M${monthIdx + 1}`, strom: 0, gas: 0, waerme: 0, wasser: 0 };
      });

      // For the current month, use live totalMonth; for past months, use totalMonth proportionally
      // Since we only have current period totals, show totalMonth as the current month bucket
      const currentMonthIdx = new Date().getMonth() - startMonth;

      for (const [meterId, pt] of Object.entries(livePeriodTotals)) {
        const info = meterMap[meterId];
        if (!info || !info.is_main_meter) continue;
        if (locationId && info.location_id !== locationId) continue;
        if (pt.totalMonth != null && currentMonthIdx >= 0 && currentMonthIdx < 3) {
          const converted = info.energy_type === "gas" && info.unit === "m³" ? gasM3ToKWh(pt.totalMonth, info.gas_type, info.brennwert, info.zustandszahl) : pt.totalMonth;
          addToEnergyBucket(buckets[currentMonthIdx], info.energy_type, converted);
        }
      }

      // Add manual readings distributed by month
      readings.forEach((r) => {
        const info = meterMap[r.meter_id];
        if (!info || info.capture_type === "automatic") return;
        const d = new Date(r.reading_date);
        if (d >= rangeStart && d <= rangeEnd) {
          const mi = d.getMonth() - startMonth;
          if (mi >= 0 && mi < 3) {
            const converted = info.energy_type === "gas" && info.unit === "m³" ? gasM3ToKWh(r.value, info.gas_type, info.brennwert, info.zustandszahl) : r.value;
            addToEnergyBucket(buckets[mi], info.energy_type, converted);
          }
        }
      });

      return buckets;
    }

    // Default: existing logic using individual readings
    const filtered = readings.filter((r) => {
      const d = new Date(r.reading_date);
      return d >= rangeStart && d <= rangeEnd;
    });

    const emptyBucket = () => ({ strom: 0, gas: 0, waerme: 0, wasser: 0 });

    const convertGas = (meterId: string, value: number): number => {
      const info = meterMap[meterId];
      if (info?.energy_type === "gas" && info.unit === "m³") {
        return gasM3ToKWh(value, info.gas_type, info.brennwert, info.zustandszahl);
      }
      return value;
    };

    const addToBucket = (bucket: EnergyBucket, r: { meter_id: string; value: number }) => {
      const info = meterMap[r.meter_id];
      const et = info?.energy_type || "strom";
      addToEnergyBucket(bucket, et, convertGas(r.meter_id, r.value));
    };

    if (period === "day") {
      // Each bucket tracks value + whether the point is real or gap-interpolated
      const buckets: DayBucket[] = Array.from({ length: 288 }, (_, i) => {
        const h = Math.floor(i / 12);
        const m = (i % 12) * 5;
        return {
          label: `${h}:${m.toString().padStart(2, "0")} Uhr`,
          ...emptyBucket(),
          real_strom: null,
          real_gas: null,
          real_waerme: null,
          real_wasser: null,
        } as DayBucket;
      });

      // Track which indices actually received a real reading
      const realIndices: Record<string, Set<number>> = { strom: new Set(), gas: new Set(), waerme: new Set(), wasser: new Set() };

      // Accumulate per meter_id per bucket to correctly average multiple readings
      // from the same meter in the same 5-min slot (e.g. sync jitter producing 2 readings),
      // then SUM the per-meter averages across all meters into the bucket.
      // Structure: bucketAccum[idx][meter_id] = { sum, count, energy_type }
      const bucketAccum: Record<number, Record<string, { sum: number; count: number; et: string }>> = {};

      // Use power readings from DB for automatic main meters
      powerReadings.forEach((pr) => {
        const info = meterMap[pr.meter_id];
        if (!info) return;
        const d = new Date(pr.recorded_at);
        const idx = Math.min(d.getHours() * 12 + Math.floor(d.getMinutes() / 5), 287);
        const et = info.energy_type || "strom";
        if (!bucketAccum[idx]) bucketAccum[idx] = {};
        if (!bucketAccum[idx][pr.meter_id]) bucketAccum[idx][pr.meter_id] = { sum: 0, count: 0, et };
        bucketAccum[idx][pr.meter_id].sum += pr.power_value;
        bucketAccum[idx][pr.meter_id].count += 1;
      });

      // For each bucket: average readings per meter, then sum across meters per energy type
      for (const [idxStr, meterMap2] of Object.entries(bucketAccum)) {
        const idx = Number(idxStr);
        for (const [, accum] of Object.entries(meterMap2)) {
          const et = accum.et as EnergyKey;
          if (ENERGY_KEYS.includes(et)) {
            buckets[idx][et] += accum.sum / accum.count;
            realIndices[et]?.add(idx);
          }
        }
      }

      // Also add manual main meter readings
      filtered.forEach((r) => {
        const info = meterMap[r.meter_id];
        if (!info || !info.is_main_meter) return;
        if (info.capture_type === "automatic") return;
        const d = new Date(r.reading_date);
        const idx = Math.min(d.getHours() * 12 + Math.floor(d.getMinutes() / 5), 287);
        addToBucket(buckets[idx], r);
        const et = info.energy_type || "strom";
        realIndices[et]?.add(idx);
      });

      // Interpolate small gaps (≤ 12 slots = 1 hour) and mark them as gap (not real)
      for (const key of ENERGY_KEYS) {
        const points: Array<{ idx: number; val: number }> = [];
        buckets.forEach((b, i) => {
          const v = getEnergyValue(b, key);
          if (v > 0) points.push({ idx: i, val: v });
        });
        for (let p = 0; p < points.length - 1; p++) {
          const start = points[p];
          const end = points[p + 1];
          const gap = end.idx - start.idx;
          if (gap > 1 && gap <= 12) {
            for (let g = 1; g < gap; g++) {
              const t = g / gap;
              setEnergyValue(buckets[start.idx + g], key, start.val + (end.val - start.val) * t);
              // gap-interpolated: do NOT add to realIndices
            }
          }
        }
      }

      // Populate real_* fields: only set where we have an actual data point
      buckets.forEach((b, i) => {
        for (const key of ENERGY_KEYS) {
          if (realIndices[key]?.has(i)) {
            setDayBucketReal(b, key, getEnergyValue(b, key));
          } else {
            setDayBucketReal(b, key, null);
          }
        }
      });

      // Cut off future buckets: for today, null everything after the current time.
      // We use the current clock time as the cut-off (not the last stored data point),
      // so that data gaps caused by spike-detection don't truncate the visible chart too early.
      const isToday = offset === 0 && (() => {
        const nowCheck = new Date();
        const ref = getRefDate("day", offset);
        return ref.toDateString() === nowCheck.toDateString();
      })();

      if (isToday) {
        const nowForCutoff = new Date();
        // The bucket index corresponding to the current time
        const currentIdx = nowForCutoff.getHours() * 12 + Math.floor(nowForCutoff.getMinutes() / 5);
        for (const key of ENERGY_KEYS) {
          for (let i = currentIdx + 1; i < buckets.length; i++) {
            setEnergyValue(buckets[i], key, null as unknown as number);
            setDayBucketReal(buckets[i], key, null);
          }
        }
      }

      return buckets;
    }

    if (period === "week") {
      const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      const todayStr = format(new Date(), "yyyy-MM-dd");
      return days.map((d, i) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const bucket = { label: dayNames[i] || format(d, "EEE", { locale: de }), ...emptyBucket() };
        // Add manual readings for this day
        filtered.forEach((r) => {
          if (format(new Date(r.reading_date), "yyyy-MM-dd") === dateStr) addToBucket(bucket, r);
        });
        // For today: inject live totalDay from automatic main meters
        if (dateStr === todayStr) {
          for (const [meterId, pt] of Object.entries(livePeriodTotals)) {
            const info = meterMap[meterId];
            if (!info || !info.is_main_meter) continue;
            if (locationId && info.location_id !== locationId) continue;
            if (pt.totalDay != null) {
              const converted = info.energy_type === "gas" && info.unit === "m³"
                ? gasM3ToKWh(pt.totalDay, info.gas_type, info.brennwert, info.zustandszahl)
                : pt.totalDay;
              addToEnergyBucket(bucket, info.energy_type, converted);
            }
          }
        }
        return bucket;
      });
    }

    if (period === "month") {
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      return days.map((d) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const bucket = { label: format(d, "d."), ...emptyBucket() };
        filtered.forEach((r) => {
          if (format(new Date(r.reading_date), "yyyy-MM-dd") === dateStr) addToBucket(bucket, r);
        });
        return bucket;
      });
    }

    if (period === "quarter") {
      const weekMap = new Map<number, { label: string; strom: number; gas: number; waerme: number; wasser: number }>();
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      days.forEach((d) => {
        const wk = getISOWeek(d);
        if (!weekMap.has(wk)) weekMap.set(wk, { label: `KW${wk}`, ...emptyBucket() });
      });
      filtered.forEach((r) => {
        const wk = getISOWeek(new Date(r.reading_date));
        const bucket = weekMap.get(wk);
        if (bucket) addToBucket(bucket, r);
      });
      return Array.from(weekMap.values());
    }

    // year
    const monthLabels = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    const buckets = monthLabels.map((m) => ({ label: m, ...emptyBucket() }));
    filtered.forEach((r) => {
      const month = new Date(r.reading_date).getMonth();
      addToBucket(buckets[month], r);
    });
    return buckets;
  }, [readings, meterMap, period, rangeStart.toISOString(), rangeEnd.toISOString(), livePeriodTotals, offset, periodLabel, locationId, powerReadings]);

  // Reset offset when period changes
  const handlePeriodChange = (v: string) => {
    setOffset(0);
    if (v === "day" || v === "week" || v === "month" || v === "quarter" || v === "year") {
      setSelectedPeriod(v as TimePeriod);
    }
  };

  if (loading || powerLoading) return <Card><CardContent className="p-6"><Skeleton className="h-[300px]" /></CardContent></Card>;

  const unitLabel = getChartUnitLabel(period);
  const isLineChart = period === "day";

  const visibleKeys = ENERGY_KEYS.filter((k) => !hiddenKeys.has(k));

  const handleLegendClick = (e: any) => {
    // dataKey can be "strom", "real_strom", "__gap_strom" — normalise to base key
    const rawKey = (e.dataKey ?? e.value ?? "") as string;
    const key = rawKey.replace(/^real_/, "").replace(/^__gap_/, "");
    if (!(ENERGY_KEYS as readonly string[]).includes(key)) return;
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const tooltipFormatter = (value: number, name: string) => {
    const typeKey = name === "Strom" ? "strom" : name === "Gas" ? "gas" : name === "Wärme" ? "waerme" : "wasser";
    const u = getUnitForPeriod(period, typeKey);
    return [`${value.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${u}`, name];
  };

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 'var(--radius)',
    color: 'hsl(var(--card-foreground))',
  };

  const tickStyle = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 };


  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg">
            Energieverbrauch ({unitLabel})
          </CardTitle>
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as ChartPeriod[]).map((key) => (
                <SelectItem key={key} value={key}>{PERIOD_LABELS[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{subtitle}</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset((o) => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[160px] text-center">{periodLabel}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canGoForward} onClick={() => setOffset((o) => o + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            Noch keine Verbrauchsdaten vorhanden
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              {isLineChart ? (
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} interval={11} tickFormatter={(v: string) => v.endsWith(":00 Uhr") ? v.replace(" Uhr", "") : ""} />
                  <YAxis width={50} tick={tickStyle} tickLine={false} axisLine={false} domain={visibleKeys.length === 0 ? [0, 1] : ['auto', 'auto']} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name, item) => {
                      const nameStr = typeof name === "string" ? name : "";
                      if (nameStr.startsWith("__gap_")) return null;
                      return tooltipFormatter(value as number, nameStr);
                    }}
                    itemSorter={(item) => ((item as any)?.dataKey as string ?? "").startsWith("real_") ? -1 : 1}
                  />
                  {visibleEnergyKeys.map((key) => {
                    const hidden = hiddenKeys.has(key);
                    const displayName = ENERGY_TYPE_LABELS[key] || key;
                    return (
                      <React.Fragment key={key}>
                        <Line type="monotone" dataKey={key} name={`__gap_${key}`} stroke={ENERGY_CHART_COLORS[key]} strokeWidth={hidden ? 0 : 1.5} strokeDasharray="4 4" dot={false} connectNulls={false} legendType="none" tooltipType="none" />
                        <Line type="monotone" dataKey={hidden ? key : `real_${key}`} name={displayName} stroke={ENERGY_CHART_COLORS[key]} strokeWidth={hidden ? 0 : 2.5} dot={false} connectNulls={false} legendType="line" />
                      </React.Fragment>
                    );
                  })}
                </LineChart>
              ) : (
                <BarChart data={chartData} barGap={2} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} />
                  <YAxis width={50} tick={tickStyle} tickLine={false} axisLine={false} domain={visibleKeys.length === 0 ? [0, 1] : ['auto', 'auto']} />
                  <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                  {visibleEnergyKeys.includes("strom") && <Bar dataKey="strom" name="Strom" fill={ENERGY_CHART_COLORS.strom} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("strom")} />}
                  {visibleEnergyKeys.includes("gas") && <Bar dataKey="gas" name="Gas" fill={ENERGY_CHART_COLORS.gas} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("gas")} />}
                  {visibleEnergyKeys.includes("waerme") && <Bar dataKey="waerme" name="Wärme" fill={ENERGY_CHART_COLORS.waerme} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("waerme")} />}
                  {visibleEnergyKeys.includes("wasser") && <Bar dataKey="wasser" name="Wasser" fill={ENERGY_CHART_COLORS.wasser} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("wasser")} />}
                </BarChart>
              )}
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              {visibleEnergyKeys.map((key) => {
                const hidden = hiddenKeys.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => handleLegendClick({ dataKey: key })}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      hidden
                        ? "border-muted text-muted-foreground opacity-50"
                        : "border-input hover:bg-accent"
                    )}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: hidden ? "hsl(var(--muted-foreground))" : ENERGY_CHART_COLORS[key] }}
                    />
                    {ENERGY_TYPE_LABELS[key] || key}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default EnergyChart;
