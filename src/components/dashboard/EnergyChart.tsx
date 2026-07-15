import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PeriodPickerLabel from "./PeriodPickerLabel";
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
import { de, enUS, es, nl } from "date-fns/locale";
import type { Locale } from "date-fns";

const localeMap: Record<string, Locale> = { de, en: enUS, es, nl };
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { useLocationEnergyTypesSet } from "@/hooks/useLocationEnergySources";

type ChartPeriod = "day" | "week" | "month" | "quarter" | "year";

const PERIOD_LABEL_KEYS: Record<ChartPeriod, string> = {
  day: "chart.periodDay",
  week: "chart.periodWeek",
  month: "chart.periodMonth",
  quarter: "chart.periodQuarter",
  year: "chart.periodYear",
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

function getPeriodLabel(period: ChartPeriod, ref: Date, locale: Locale, cwPrefix: string): string {
  switch (period) {
    case "day": return format(ref, "EEEE, d. MMM yyyy", { locale });
    case "week": return `${cwPrefix} ${getISOWeek(ref)}, ${format(ref, "yyyy")}`;
    case "month": return format(ref, "MMMM yyyy", { locale });
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
  const { selectedPeriod, setSelectedPeriod, selectedOffset: offset, setSelectedOffset: setOffset } = useDashboardFilter();
  const { t, language } = useTranslation();
  const T = (key: string) => t(key as any);
  const dateLocale = localeMap[language] || de;
  const cwPrefix = T("chart.cwPrefix");
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [powerReadings, setPowerReadings] = useState<Array<{ meter_id: string; power_value: number; recorded_at: string }>>([]);
  const [powerLoading, setPowerLoading] = useState(false);
  const allowedTypes = useLocationEnergyTypesSet(locationId);
  const visibleEnergyKeys = useMemo(() => ENERGY_KEYS.filter(k => allowedTypes.has(k)), [allowedTypes]);

  // DB-based daily totals for non-day periods
  const [dailyTotals, setDailyTotals] = useState<Array<{ meter_id: string; day: string; bezug: number; einspeisung: number; source: string }>>([]);
  const [dailyTotalsLoading, setDailyTotalsLoading] = useState(false);

  // Map "all" to "year" for this chart
  const period: ChartPeriod = selectedPeriod === "all" ? "year" : selectedPeriod;

  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const subtitle = selectedLocation ? T("chart.dataFor").replace("{name}", selectedLocation.name) : T("chart.allLocations");

  const meterMap = useMemo(() => {
    const map: Record<string, { energy_type: string; capture_type: string; location_id: string; is_main_meter: boolean; unit: string; gas_type: string | null; brennwert: number | null; zustandszahl: number | null }> = {};
    meters.forEach((m) => { map[m.id] = { energy_type: m.energy_type, capture_type: m.capture_type, location_id: m.location_id, is_main_meter: m.is_main_meter, unit: m.unit, gas_type: m.gas_type ?? null, brennwert: m.brennwert ?? null, zustandszahl: m.zustandszahl ?? null }; });
    return map;
  }, [meters]);

  const refDate = getRefDate(period, offset);
  const weekStartsOn = useWeekStartDay();
  const [rangeStart, rangeEnd] = getPeriodRange(period, refDate, weekStartsOn);
  const periodLabel = getPeriodLabel(period, refDate, dateLocale, cwPrefix);
  const canGoForward = offset < 0;

  // Fetch power readings from DB for day view
  // Strategy: Use server-side get_power_readings_5min function which automatically
  // aggregates raw data into 5min buckets when pre-aggregated data isn't available.
  // For today, supplement with raw data for the last 10 minutes (not yet aggregated).
  const isTodayView = period === "day" && offset === 0 && new Date().toDateString() === getRefDate("day", 0).toDateString();
  useEffect(() => {
    if (period !== "day") {
      setPowerReadings([]);
      return;
    }
    let stale = false;
    const fetchPower = async () => {
      setPowerLoading(true);
      const mainMeterIds = meters
        .filter(m => !m.is_archived && m.is_main_meter && m.capture_type === "automatic")
        .filter(m => !locationId || m.location_id === locationId)
        .map(m => m.id);

      if (mainMeterIds.length === 0) {
        if (!stale) { setPowerReadings([]); setPowerLoading(false); }
        return;
      }

      const isToday = offset === 0 && new Date().toDateString() === getRefDate("day", 0).toDateString();

      let allData: Array<{ meter_id: string; power_value: number; recorded_at: string }> = [];

      // Paginate to avoid PostgREST row limits when many main meters × 288 buckets/day
      // exceed a single page (e.g. "Alle Liegenschaften" view truncates Strom after noon).
      const PAGE_SIZE = 1000;
      let pageIdx = 0;
      while (true) {
        const from = pageIdx * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data: pageData, error: aggError } = await supabase
          .rpc("get_power_readings_5min", {
            p_meter_ids: mainMeterIds,
            p_start: rangeStart.toISOString(),
            p_end: rangeEnd.toISOString(),
          })
          .range(from, to);

        if (stale) return;

        if (aggError) {
          console.warn("get_power_readings_5min error:", aggError);
          break;
        }
        if (!pageData || pageData.length === 0) break;

        allData = allData.concat(
          (pageData as Array<{ meter_id: string; power_avg: number; bucket: string }>).map((r) => ({
            meter_id: r.meter_id,
            power_value: r.power_avg,
            recorded_at: r.bucket,
          }))
        );

        if (pageData.length < PAGE_SIZE) break;
        pageIdx++;
        if (pageIdx > 50) break; // safety
      }

      if (!stale) {
        // Temporäre Diagnose (cw@aicono.de empty-chart Ticket) — nach Fix entfernen.
        console.info("[energy-chart:diag]", {
          period,
          offset,
          locationId,
          mainMeterIds,
          rangeStart: rangeStart.toISOString(),
          rangeEnd: rangeEnd.toISOString(),
          rows: allData.length,
          firstRow: allData[0],
          lastRow: allData[allData.length - 1],
        });
        setPowerReadings(allData);
        setPowerLoading(false);
      }
    };
    fetchPower();

    // Auto-refetch every 5 minutes for today's view so new aggregated buckets appear
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTodayView) {
      interval = setInterval(fetchPower, 5 * 60 * 1000);
    }

    return () => {
      stale = true;
      if (interval) clearInterval(interval);
    };
  }, [period, rangeStart.toISOString(), rangeEnd.toISOString(), meters, locationId, offset]);

  // Fetch daily totals from DB for non-day periods (week, month, quarter, year)
  // Also compute today's running total from power readings as fallback
  useEffect(() => {
    if (period === "day") {
      setDailyTotals([]);
      return;
    }
    let stale = false;
    const fetchDailyTotals = async () => {
      const mainMeterIds = meters
        .filter(m => !m.is_archived && m.is_main_meter && m.capture_type === "automatic")
        .filter(m => !locationId || m.location_id === locationId)
        .map(m => m.id);

      if (mainMeterIds.length === 0) {
        if (!stale) setDailyTotals([]);
        return;
      }

      setDailyTotalsLoading(true);
      const fromDate = format(rangeStart, "yyyy-MM-dd");
      const toDate = format(rangeEnd, "yyyy-MM-dd");

      const { data, error } = await supabase.rpc("get_meter_daily_totals_split_with_fallback" as any, {
        p_meter_ids: mainMeterIds,
        p_from_date: fromDate,
        p_to_date: toDate,
      });

      if (stale) return;

      let results = (data ?? []) as Array<{ meter_id: string; day: string; bezug: number; einspeisung: number; source: string }>;

      if (error) {
        console.error("Error fetching daily totals:", error);
        results = [];
      }

      if (!stale) {
        setDailyTotals(results);
        setDailyTotalsLoading(false);
      }
    };
    fetchDailyTotals();
    return () => { stale = true; };
  }, [period, rangeStart.toISOString(), rangeEnd.toISOString(), meters, locationId]);

  const chartData = useMemo(() => {
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

    // Helper: build a map of date -> energy bucket from DB daily totals
    // Also tracks bezug/einspeisung split for bidirectional meters and
    // marks the day as a "gap" if NO verified daily total (source='archived')
    // exists for that day across all queried meters – i.e. the value would
    // otherwise be silently substituted from the 5-min fallback.
    const buildDailyBucketsFromDB = (): Map<string, EnergyBucket & Record<string, number | boolean>> => {
      const map = new Map<string, EnergyBucket & Record<string, number | boolean>>();
      // First pass: track per (date, energy_type) whether at least one
      // 'archived' (verified Loxone daily total) row exists.
      const hasArchived = new Map<string, Set<string>>(); // dateStr -> Set<energy_type>
      for (const row of dailyTotals) {
        const info = meterMap[row.meter_id];
        if (!info) continue;
        const dayStr = typeof row.day === "string" ? row.day.split("T")[0] : format(new Date(row.day), "yyyy-MM-dd");
        // Verified sources: archived Loxone day totals, live Loxone totalDay for today,
        // CSV-verified repairs, manual readings, MSCONS imports. Only the 5-min
        // estimate ('today_running') counts as a gap.
        if (row.source !== "today_running") {
          if (!hasArchived.has(dayStr)) hasArchived.set(dayStr, new Set());
          hasArchived.get(dayStr)!.add(info.energy_type);
        }
      }

      for (const row of dailyTotals) {
        const info = meterMap[row.meter_id];
        if (!info) continue;
        const dayStr = typeof row.day === "string" ? row.day.split("T")[0] : format(new Date(row.day), "yyyy-MM-dd");
        if (!map.has(dayStr)) map.set(dayStr, { ...emptyBucket() });
        const bucket = map.get(dayStr)!;
        const netValue = row.bezug - row.einspeisung;
        const converted = convertGas(row.meter_id, netValue);
        addToEnergyBucket(bucket, info.energy_type, converted);

        // Mark gap flag per energy_type if no archived value exists for this day+type
        const isGap = !(hasArchived.get(dayStr)?.has(info.energy_type));
        (bucket as any)[`__gap_${info.energy_type}`] = isGap;
        (bucket as any)[`__source_${info.energy_type}`] = row.source;

        // For non-day bar charts: use pre-split bezug/einspeisung
        if (period !== "day") {
          const bezugKey = `${info.energy_type}_bezug`;
          const einspeisungKey = `${info.energy_type}_einspeisung`;
          bucket[bezugKey] = ((bucket[bezugKey] as number) ?? 0) + convertGas(row.meter_id, row.bezug);
          bucket[einspeisungKey] = ((bucket[einspeisungKey] as number) ?? 0) + convertGas(row.meter_id, row.einspeisung);
        }
      }
      return map;
    };

    // Helper: add today's live totalDay from Loxone for a specific bucket
    const addLiveTodayToBucket = (bucket: EnergyBucket) => {
      const todayStr = format(new Date(), "yyyy-MM-dd");
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
      return todayStr;
    };

    // Filter readings to current range
    const filtered = readings.filter((r) => {
      const d = new Date(r.reading_date);
      return d >= rangeStart && d <= rangeEnd;
    });

    if (period === "day") {
      // Each bucket tracks value + whether the point is real or gap-interpolated
      const buckets: DayBucket[] = Array.from({ length: 288 }, (_, i) => {
        const h = Math.floor(i / 12);
        const m = (i % 12) * 5;
        const timeSuffix = T("chart.timeLabel");
        return {
          label: `${h}:${m.toString().padStart(2, "0")}${timeSuffix ? ` ${timeSuffix}` : ""}`,
          ...emptyBucket(),
          real_strom: null,
          real_gas: null,
          real_waerme: null,
          real_wasser: null,
        } as DayBucket;
      });

      // Track which indices actually received a real reading (per energy type, post-sum)
      const realIndices: Record<string, Set<number>> = { strom: new Set(), gas: new Set(), waerme: new Set(), wasser: new Set() };

      // Step 1: Build a per-meter time series of 288 slots.
      // Multiple raw readings inside the same 5-min slot are averaged.
      // Structure: meterSeries[meter_id] = { et, values: (number|null)[288] }
      const meterSeries: Record<string, { et: string; values: (number | null)[]; counts: number[] }> = {};

      powerReadings.forEach((pr) => {
        const info = meterMap[pr.meter_id];
        if (!info) return;
        const d = new Date(pr.recorded_at);
        const idx = Math.min(d.getHours() * 12 + Math.floor(d.getMinutes() / 5), 287);
        const et = info.energy_type || "strom";
        if (!meterSeries[pr.meter_id]) {
          meterSeries[pr.meter_id] = {
            et,
            values: Array.from({ length: 288 }, () => null),
            counts: Array.from({ length: 288 }, () => 0),
          };
        }
        const s = meterSeries[pr.meter_id];
        const cur = s.values[idx];
        const cnt = s.counts[idx];
        s.values[idx] = cur == null ? pr.power_value : (cur * cnt + pr.power_value) / (cnt + 1);
        s.counts[idx] = cnt + 1;
      });

      // Step 2: Per meter, forward-fill (step function) up to MAX_FILL_SLOTS = 36 (= 3 h)
      // beyond each real reading. Larger gaps remain null = real data outage.
      // This makes the SUM across meters stable when meters poll at 15-min intervals
      // but at different sub-minutes within the window.
      //
      // "Real" vs. "forward-filled" wird zeitbasiert bewertet: pro Meter wird der
      // tatsächliche Poll-Abstand (Median der Slot-Abstände zwischen echten Messungen)
      // geschätzt. Forward-Fill innerhalb von (pollSlots + Toleranz=1 Slot) gilt
      // weiterhin als "real", damit die durchgezogene Linie auch bei 15-Min-Poll
      // entsteht. Erst echte Datenausfälle (länger als Poll-Intervall + Toleranz)
      // werden als gestrichelte Lücke dargestellt.
      const MAX_FILL_SLOTS = 36; // 3 hours; covers 15-min polling + safety margin
      const TOLERANCE_SLOTS = 1; // = 5 Min Toleranz
      const filledFlag: Record<string, boolean[]> = {}; // per meter: was this slot real (false) or forward-filled-but-treated-as-gap (true)?
      for (const [mid, s] of Object.entries(meterSeries)) {
        // Geschätzten Poll-Abstand bestimmen: Median der Slot-Abstände zwischen
        // aufeinanderfolgenden echten Messungen. Fallback: 1 Slot (5 Min).
        const realIdx: number[] = [];
        for (let i = 0; i < 288; i++) if (s.values[i] != null) realIdx.push(i);
        let pollSlots = 1;
        if (realIdx.length >= 2) {
          const diffs: number[] = [];
          for (let k = 1; k < realIdx.length; k++) diffs.push(realIdx[k] - realIdx[k - 1]);
          diffs.sort((a, b) => a - b);
          const med = diffs[Math.floor(diffs.length / 2)];
          pollSlots = Math.max(1, Math.min(12, med)); // cap auf 60 Min (12 Slots)
        }
        const realWindow = pollSlots + TOLERANCE_SLOTS;

        const flags = Array.from({ length: 288 }, () => false);
        let lastVal: number | null = null;
        let slotsSinceReal = 0;
        for (let i = 0; i < 288; i++) {
          if (s.values[i] != null) {
            lastVal = s.values[i];
            slotsSinceReal = 0;
          } else if (lastVal != null && slotsSinceReal < MAX_FILL_SLOTS) {
            s.values[i] = lastVal;
            // Innerhalb des Poll-Fensters zählt der Slot weiterhin als "real",
            // damit die durchgezogene Linie nicht ausfranst.
            flags[i] = slotsSinceReal >= realWindow;
            slotsSinceReal++;
          } else {
            slotsSinceReal++;
          }
        }
        filledFlag[mid] = flags;
      }

      // Step 3: Sum per-meter series into per-bucket per-energy-type totals.
      // A bucket counts as "real" for an energy type if at least one contributing
      // meter has a real (non-forward-filled) reading at that slot.
      for (let i = 0; i < 288; i++) {
        for (const [mid, s] of Object.entries(meterSeries)) {
          const v = s.values[i];
          if (v == null) continue;
          const et = s.et as EnergyKey;
          if (!ENERGY_KEYS.includes(et)) continue;
          buckets[i][et] += v;
          if (!filledFlag[mid][i]) realIndices[et]?.add(i);
        }
      }

      // Manual meters are excluded from day view – no meaningful daily granularity

      // Populate real_* fields: mark slots where at least one meter had a real reading
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

    // For non-day periods, only use manual-meter readings from `filtered` to avoid
    // double-counting automatic meters whose data comes from dailyTotals / livePeriodTotals.
    const autoMeterIds = new Set(
      meters.filter(m => m.capture_type === "automatic" && !m.is_archived).map(m => m.id)
    );
    const manualFiltered = filtered.filter(r => !autoMeterIds.has(r.meter_id));

    // Helper: copy bezug/einspeisung split fields from dbBucket into target
    const addSplitFields = (target: any, dbBucket: any) => {
      for (const key of ENERGY_KEYS) {
        const bk = `${key}_bezug`;
        const ek = `${key}_einspeisung`;
        if (dbBucket[bk] != null) target[bk] = (target[bk] ?? 0) + dbBucket[bk];
        if (dbBucket[ek] != null) target[ek] = (target[ek] ?? 0) + dbBucket[ek];
      }
    };

    if (period === "week") {
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const dbDailyMap = buildDailyBucketsFromDB();
      return days.map((d, i) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const bucket: any = { label: format(d, "EEEEEE", { locale: dateLocale }), ...emptyBucket() };
        const dbBucket = dbDailyMap.get(dateStr);
        if (dbBucket) {
          for (const key of ENERGY_KEYS) {
            addToEnergyBucket(bucket, key, (dbBucket as any)[key]);
            if ((dbBucket as any)[`__gap_${key}`]) bucket[`__gap_${key}`] = true;
          }
          addSplitFields(bucket, dbBucket);
        }
        manualFiltered.forEach((r) => {
          if (format(new Date(r.reading_date), "yyyy-MM-dd") === dateStr) addToBucket(bucket, r);
        });
        if (dateStr === todayStr && !dbBucket) {
          addLiveTodayToBucket(bucket);
          for (const key of ENERGY_KEYS) bucket[`__gap_${key}`] = true;
        }
        return bucket;
      });
    }

    if (period === "month") {
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const dbDailyMap = buildDailyBucketsFromDB();
      return days.map((d) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const bucket: any = { label: format(d, "d."), ...emptyBucket() };
        const dbBucket = dbDailyMap.get(dateStr);
        if (dbBucket) {
          for (const key of ENERGY_KEYS) {
            addToEnergyBucket(bucket, key, (dbBucket as any)[key]);
            if ((dbBucket as any)[`__gap_${key}`]) bucket[`__gap_${key}`] = true;
          }
          addSplitFields(bucket, dbBucket);
        }
        manualFiltered.forEach((r) => {
          if (format(new Date(r.reading_date), "yyyy-MM-dd") === dateStr) addToBucket(bucket, r);
        });
        if (dateStr === todayStr && !dbBucket) {
          addLiveTodayToBucket(bucket);
          for (const key of ENERGY_KEYS) bucket[`__gap_${key}`] = true;
        }
        return bucket;
      });
    }

    if (period === "quarter") {
      const weekMap = new Map<number, any>();
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const dbDailyMap = buildDailyBucketsFromDB();
      days.forEach((d) => {
        const wk = getISOWeek(d);
        if (!weekMap.has(wk)) weekMap.set(wk, { label: `${cwPrefix}${wk}`, ...emptyBucket() });
        const dateStr = format(d, "yyyy-MM-dd");
        const bucket = weekMap.get(wk)!;
        const dbBucket = dbDailyMap.get(dateStr);
        if (dbBucket) {
          for (const key of ENERGY_KEYS) addToEnergyBucket(bucket, key, (dbBucket as any)[key]);
          addSplitFields(bucket, dbBucket);
        }
        if (dateStr === todayStr && !dbBucket) {
          addLiveTodayToBucket(bucket);
        }
      });
      manualFiltered.forEach((r) => {
        const wk = getISOWeek(new Date(r.reading_date));
        const bucket = weekMap.get(wk);
        if (bucket) addToBucket(bucket, r);
      });
      return Array.from(weekMap.values());
    }

    // year
    const monthLabels = Array.from({ length: 12 }, (_, i) => T(`month.short.${i}`));
    const buckets: any[] = monthLabels.map((m) => ({ label: m, ...emptyBucket() }));
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const dbDailyMap = buildDailyBucketsFromDB();
    for (const [dateStr, dbBucket] of dbDailyMap.entries()) {
      const monthIdx = new Date(dateStr).getMonth();
      for (const key of ENERGY_KEYS) addToEnergyBucket(buckets[monthIdx], key, (dbBucket as any)[key]);
      addSplitFields(buckets[monthIdx], dbBucket);
    }
    if (!dbDailyMap.has(todayStr)) {
      const todayBucket = emptyBucket();
      addLiveTodayToBucket(todayBucket);
      const monthIdx = new Date().getMonth();
      for (const key of ENERGY_KEYS) addToEnergyBucket(buckets[monthIdx], key, todayBucket[key]);
    }
    manualFiltered.forEach((r) => {
      const month = new Date(r.reading_date).getMonth();
      addToBucket(buckets[month], r);
    });
    return buckets;
  }, [readings, meterMap, period, rangeStart.toISOString(), rangeEnd.toISOString(), livePeriodTotals, offset, periodLabel, locationId, powerReadings, dailyTotals]);

  // Detect which energy types have bidirectional (bezug+einspeisung) data
  const bidirectionalTypes = useMemo(() => {
    if (period === "day") return new Set<string>();
    const types = new Set<string>();
    for (const bucket of chartData) {
      for (const key of ENERGY_KEYS) {
        if ((bucket as any)[`${key}_einspeisung`] > 0) types.add(key);
      }
    }
    return types;
  }, [chartData, period]);

  // Reset offset when period changes (handled by context now)
  const handlePeriodChange = (v: string) => {
    if (v === "day" || v === "week" || v === "month" || v === "quarter" || v === "year") {
      setSelectedPeriod(v as TimePeriod);
    }
  };

  // Compute filtered chart data that zeros out hidden energy types so Y-axis rescales
  const filteredChartData = useMemo(() => {
    if (hiddenKeys.size === 0) return chartData;
    return chartData.map((bucket: any) => {
      const clone = { ...bucket };
      for (const key of hiddenKeys) {
        clone[key] = 0;
        if (`real_${key}` in clone) clone[`real_${key}`] = null;
        if (`__gap_${key}` in clone) clone[`__gap_${key}`] = null;
        clone[`${key}_bezug`] = 0;
        clone[`${key}_einspeisung`] = 0;
      }
      return clone;
    });
  }, [chartData, hiddenKeys]);

  // Temp diag
  useEffect(() => {
    if (period === "day") {
      const sample = (filteredChartData as any[]).filter((b, i) => (b.strom || b.gas || b.wasser || b.waerme) && i < 288).slice(0, 3);
      console.info("[energy-chart:chartdata]", {
        period, len: filteredChartData.length, visibleEnergyKeys, allowedTypes: Array.from(allowedTypes), sample,
        b103: filteredChartData[103], b50: filteredChartData[50], hasData, powerReadingsLen: powerReadings.length,
      });
    }
  }, [filteredChartData, period, visibleEnergyKeys, allowedTypes, hasData, powerReadings.length]);

  if (loading || powerLoading || dailyTotalsLoading) return <Card><CardContent className="p-6"><Skeleton className="h-[300px]" /></CardContent></Card>;

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
    const typeKey = name.toLowerCase();
    const energyKey = ENERGY_KEYS.find(k => T(`energy.${k}`) === name) || typeKey;
    const u = getUnitForPeriod(period, energyKey);
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
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg">
            {t("chart.title" as any)} ({unitLabel})
          </CardTitle>
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL_KEYS) as ChartPeriod[]).map((key) => (
                <SelectItem key={key} value={key}>{t(PERIOD_LABEL_KEYS[key] as any)}</SelectItem>
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
            <PeriodPickerLabel period={period} label={periodLabel} refDate={refDate} className="min-w-[160px]" />
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canGoForward} onClick={() => setOffset((o) => o + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 min-h-0 flex-col">
        {!hasData ? (
          <div className="flex min-h-[300px] flex-1 items-center justify-center text-muted-foreground text-sm">
            {t("chart.noData" as any)}
          </div>
        ) : (
          <>
            <div className="min-h-[300px] flex-1 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              {isLineChart ? (
                <LineChart data={filteredChartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} interval={11} tickFormatter={(v: string) => v.includes(":00") ? v.split(" ")[0] : ""} />
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
                    const displayName = T(`energy.${key}`);
                    return (
                      <Line key={key} type="monotone" dataKey={key} name={displayName} stroke={ENERGY_CHART_COLORS[key]} strokeWidth={hidden ? 0 : 2.5} dot={false} connectNulls={false} legendType="line" />
                    );
                  })}
                </LineChart>
              ) : (
                <BarChart data={filteredChartData} barGap={2} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <defs>
                    {ENERGY_KEYS.map((key) => (
                      <pattern
                        key={`pat-${key}`}
                        id={`gap-pattern-${key}`}
                        patternUnits="userSpaceOnUse"
                        width="6"
                        height="6"
                        patternTransform="rotate(45)"
                      >
                        <rect width="6" height="6" fill={ENERGY_CHART_COLORS[key]} fillOpacity="0.18" />
                        <line x1="0" y1="0" x2="0" y2="6" stroke={ENERGY_CHART_COLORS[key]} strokeWidth="2" />
                      </pattern>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} />
                  <YAxis width={50} tick={tickStyle} tickLine={false} axisLine={false} domain={visibleKeys.length === 0 ? [0, 1] : ['auto', 'auto']} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, name: string, item: any) => {
                      const [labelText, _] = tooltipFormatter(value, name);
                      const payload = item?.payload ?? {};
                      const energyKey = ENERGY_KEYS.find(k => T(`energy.${k}`) === name || name.startsWith(T(`energy.${k}`)));
                      const isGap = energyKey ? payload[`__gap_${energyKey}`] === true : false;
                      const suffix = isGap ? " ⚠ Tageswert fehlt (nur 5-Min-Schätzung)" : "";
                      return [labelText + suffix, name];
                    }}
                  />
                  {visibleEnergyKeys.map((key) => {
                    if (bidirectionalTypes.has(key)) {
                      return (
                        <React.Fragment key={key}>
                          <Bar dataKey={`${key}_bezug`} name={`${T(`energy.${key}`)} Bezug`} fill={ENERGY_CHART_COLORS[key]} radius={[3, 3, 0, 0]} hide={hiddenKeys.has(key)} />
                          <Bar dataKey={`${key}_einspeisung`} name={`${T(`energy.${key}`)} Einspeisung`} fill="#10b981" radius={[3, 3, 0, 0]} hide={hiddenKeys.has(key)} />
                        </React.Fragment>
                      );
                    }
                    return (
                      <Bar key={key} dataKey={key} name={T(`energy.${key}`)} fill={ENERGY_CHART_COLORS[key]} radius={[3, 3, 0, 0]} hide={hiddenKeys.has(key)} />
                    );
                  })}
                </BarChart>
              )}
            </ResponsiveContainer>
            </div>
            <div className="flex shrink-0 items-center justify-center gap-2 mt-3 flex-wrap pb-1">
              {visibleEnergyKeys.flatMap((key) => {
                if (bidirectionalTypes.has(key)) {
                  return [
                    { dataKey: key, label: `${T(`energy.${key}`)} Bezug`, color: ENERGY_CHART_COLORS[key] },
                    { dataKey: key, label: `${T(`energy.${key}`)} Einspeisung`, color: "#10b981" },
                  ];
                }
                return [{ dataKey: key, label: T(`energy.${key}`), color: ENERGY_CHART_COLORS[key] }];
              }).map((item, idx) => {
                const hidden = hiddenKeys.has(item.dataKey);
                return (
                  <button
                    key={`${item.dataKey}-${idx}`}
                    onClick={() => handleLegendClick({ dataKey: item.dataKey })}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      hidden
                        ? "border-muted text-muted-foreground opacity-50"
                        : "border-input hover:bg-accent"
                    )}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: hidden ? "hsl(var(--muted-foreground))" : item.color }}
                    />
                    {item.label}
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
