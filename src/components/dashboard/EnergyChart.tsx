import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useMeters } from "@/hooks/useMeters";
import { useLocations } from "@/hooks/useLocations";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ENERGY_CHART_COLORS } from "@/lib/energyTypeColors";
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
  useEffect(() => {
    if (period !== "day") {
      setPowerReadings([]);
      return;
    }
    const fetchPower = async () => {
      setPowerLoading(true);
      // Get main meter IDs for the location
      const mainMeterIds = meters
        .filter(m => !m.is_archived && m.is_main_meter && m.capture_type === "automatic")
        .filter(m => !locationId || m.location_id === locationId)
        .map(m => m.id);

      if (mainMeterIds.length === 0) {
        setPowerReadings([]);
        setPowerLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("meter_power_readings")
        .select("meter_id, power_value, recorded_at")
        .in("meter_id", mainMeterIds)
        .gte("recorded_at", rangeStart.toISOString())
        .lte("recorded_at", rangeEnd.toISOString())
        .order("recorded_at", { ascending: true });

      if (error) {
        console.error("Error fetching power readings:", error);
        setPowerReadings([]);
      } else {
        setPowerReadings((data ?? []) as Array<{ meter_id: string; power_value: number; recorded_at: string }>);
      }
      setPowerLoading(false);
    };
    fetchPower();
  }, [period, rangeStart.toISOString(), rangeEnd.toISOString(), meters, locationId]);

  const chartData = useMemo(() => {
    // For non-day periods at offset 0, inject Loxone period totals for automatic main meters
    const isCurrentPeriod = offset === 0;
    const useLoxoneTotals = isCurrentPeriod && period !== "day" && Object.keys(livePeriodTotals).length > 0;

    // Determine which period total field to use
    const periodTotalKey = period === "week" ? "totalWeek" : period === "month" ? "totalMonth" : period === "year" ? "totalYear" : null;

    // For current period with Loxone totals: show a single aggregated bar
    if (useLoxoneTotals && periodTotalKey && period !== "quarter") {
      const totals = { strom: 0, gas: 0, waerme: 0, wasser: 0 };

      // Add Loxone period totals for automatic main meters only
      for (const [meterId, pt] of Object.entries(livePeriodTotals)) {
        const info = meterMap[meterId];
        if (!info || !info.is_main_meter) continue;
        if (locationId && info.location_id !== locationId) continue;
        const rawVal = pt[periodTotalKey as keyof typeof pt];
        if (rawVal != null && info.energy_type in totals) {
          const converted = info.energy_type === "gas" && info.unit === "m³" ? gasM3ToKWh(rawVal, info.gas_type, info.brennwert, info.zustandszahl) : rawVal;
          (totals as any)[info.energy_type] += converted;
        }
      }

      // Add manual main meter readings for the period
      const [rs, re] = [rangeStart, rangeEnd];
      readings.forEach((r) => {
        const info = meterMap[r.meter_id];
        if (!info || info.capture_type === "automatic" || !info.is_main_meter) return;
        const d = new Date(r.reading_date);
        if (d >= rs && d <= re && info.energy_type in totals) {
          const converted = info.energy_type === "gas" && info.unit === "m³" ? gasM3ToKWh(r.value, info.gas_type, info.brennwert, info.zustandszahl) : r.value;
          (totals as any)[info.energy_type] += converted;
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
        if (pt.totalMonth != null && currentMonthIdx >= 0 && currentMonthIdx < 3 && info.energy_type in buckets[currentMonthIdx]) {
          const converted = info.energy_type === "gas" && info.unit === "m³" ? gasM3ToKWh(pt.totalMonth, info.gas_type, info.brennwert, info.zustandszahl) : pt.totalMonth;
          (buckets[currentMonthIdx] as any)[info.energy_type] += converted;
        }
      }

      // Add manual readings distributed by month
      readings.forEach((r) => {
        const info = meterMap[r.meter_id];
        if (!info || info.capture_type === "automatic") return;
        const d = new Date(r.reading_date);
        if (d >= rangeStart && d <= rangeEnd) {
          const mi = d.getMonth() - startMonth;
          if (mi >= 0 && mi < 3 && info.energy_type in buckets[mi]) {
            const converted = info.energy_type === "gas" && info.unit === "m³" ? gasM3ToKWh(r.value, info.gas_type, info.brennwert, info.zustandszahl) : r.value;
            (buckets[mi] as any)[info.energy_type] += converted;
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

    const addToBucket = (bucket: any, r: { meter_id: string; value: number }) => {
      const info = meterMap[r.meter_id];
      const et = info?.energy_type || "strom";
      if (et in bucket) bucket[et] += convertGas(r.meter_id, r.value);
    };

    if (period === "day") {
      // Each bucket tracks value + whether the point is real or gap-interpolated
      const buckets = Array.from({ length: 288 }, (_, i) => {
        const h = Math.floor(i / 12);
        const m = (i % 12) * 5;
        return {
          label: `${h}:${m.toString().padStart(2, "0")} Uhr`,
          ...emptyBucket(),
          // real_* mirrors the energy value but is null for gap slots
          real_strom: null as number | null,
          real_gas: null as number | null,
          real_waerme: null as number | null,
          real_wasser: null as number | null,
        };
      });

      // Track which indices actually received a real reading
      const realIndices: Record<string, Set<number>> = { strom: new Set(), gas: new Set(), waerme: new Set(), wasser: new Set() };

      // Use power readings from DB for automatic main meters
      powerReadings.forEach((pr) => {
        const info = meterMap[pr.meter_id];
        if (!info) return;
        const d = new Date(pr.recorded_at);
        const idx = Math.min(d.getHours() * 12 + Math.floor(d.getMinutes() / 5), 287);
        const et = info.energy_type || "strom";
        if (et in buckets[idx]) {
          (buckets[idx] as any)[et] += pr.power_value;
          realIndices[et]?.add(idx);
        }
      });

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
          const v = (b as any)[key] as number;
          if (v > 0) points.push({ idx: i, val: v });
        });
        for (let p = 0; p < points.length - 1; p++) {
          const start = points[p];
          const end = points[p + 1];
          const gap = end.idx - start.idx;
          if (gap > 1 && gap <= 12) {
            for (let g = 1; g < gap; g++) {
              const t = g / gap;
              (buckets[start.idx + g] as any)[key] = start.val + (end.val - start.val) * t;
              // gap-interpolated: do NOT add to realIndices
            }
          }
        }
      }

      // Populate real_* fields: only set where we have an actual data point
      buckets.forEach((b, i) => {
        for (const key of ENERGY_KEYS) {
          const realKey = `real_${key}` as const;
          if (realIndices[key]?.has(i)) {
            (b as any)[realKey] = (b as any)[key];
          } else {
            (b as any)[realKey] = null;
          }
        }
      });

      // Find the last real data point for each energy key and null-out everything after it.
      // This prevents dashed lines from being drawn into future (no-data) time slots.
      const isToday = offset === 0 && (() => {
        const now = new Date();
        const ref = getRefDate("day", offset);
        return ref.toDateString() === now.toDateString();
      })();

      if (isToday) {
        for (const key of ENERGY_KEYS) {
          // Find the highest index with a real reading
          const realSet = realIndices[key];
          let lastRealIdx = -1;
          if (realSet && realSet.size > 0) {
            lastRealIdx = Math.max(...realSet);
          }
          // Null out all values after the last real data point
          for (let i = lastRealIdx + 1; i < buckets.length; i++) {
            (buckets[i] as any)[key] = null;
            (buckets[i] as any)[`real_${key}`] = null;
          }
        }
      }

      return buckets;
    }

    if (period === "week") {
      const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      return days.map((d, i) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const bucket = { label: dayNames[i] || format(d, "EEE", { locale: de }), ...emptyBucket() };
        filtered.forEach((r) => {
          if (format(new Date(r.reading_date), "yyyy-MM-dd") === dateStr) addToBucket(bucket, r);
        });
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
    const key = e.dataKey as string;
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

  const legendFormatter = (value: string, entry: any) => {
    const hidden = hiddenKeys.has(entry.dataKey);
    return <span style={{ color: hidden ? 'hsl(var(--muted-foreground))' : undefined, opacity: hidden ? 0.4 : 1, cursor: 'pointer' }}>{value}</span>;
  };

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
          <ResponsiveContainer width="100%" height={300}>
            {isLineChart ? (
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} interval={11} tickFormatter={(v: string) => v.endsWith(":00 Uhr") ? v.replace(" Uhr", "") : ""} />
                <YAxis width={50} tick={tickStyle} tickLine={false} axisLine={false} domain={visibleKeys.length === 0 ? [0, 1] : ['auto', 'auto']} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name, item) => {
                    const dk = (item as any)?.dataKey as string | undefined;
                    // Skip gap (dashed) lines and real_* duplicate keys in tooltip
                    if (dk && (dk.startsWith("real_") || (typeof name === "string" && name.startsWith("__gap_")))) return ["", ""];
                    return tooltipFormatter(value as number, name as string);
                  }}
                  itemSorter={(item) => ((item as any)?.dataKey as string ?? "").startsWith("real_") ? 1 : 0}
                />
                <Legend wrapperStyle={{ fontSize: 12, cursor: 'pointer' }} onClick={handleLegendClick} formatter={(value, entry) => {
                  // hide real_* duplicate entries from legend; show only named energy type lines
                  const dk = (entry as any).dataKey as string | undefined;
                  if (dk && dk.startsWith("real_")) return null;
                  return legendFormatter(value, entry);
                }} />
                {/* Strom: dashed = full line (gaps included), solid = real data only */}
                {visibleEnergyKeys.includes("strom") && !hiddenKeys.has("strom") && <>
                  <Line type="monotone" dataKey="strom" name="__gap_strom" stroke={ENERGY_CHART_COLORS.strom} strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="real_strom" name="Strom" stroke={ENERGY_CHART_COLORS.strom} strokeWidth={2.5} dot={false} connectNulls={false} legendType="line" />
                </>}
                {visibleEnergyKeys.includes("gas") && !hiddenKeys.has("gas") && <>
                  <Line type="monotone" dataKey="gas" name="__gap_gas" stroke={ENERGY_CHART_COLORS.gas} strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="real_gas" name="Gas" stroke={ENERGY_CHART_COLORS.gas} strokeWidth={2.5} dot={false} connectNulls={false} legendType="line" />
                </>}
                {visibleEnergyKeys.includes("waerme") && !hiddenKeys.has("waerme") && <>
                  <Line type="monotone" dataKey="waerme" name="__gap_waerme" stroke={ENERGY_CHART_COLORS.waerme} strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="real_waerme" name="Wärme" stroke={ENERGY_CHART_COLORS.waerme} strokeWidth={2.5} dot={false} connectNulls={false} legendType="line" />
                </>}
                {visibleEnergyKeys.includes("wasser") && !hiddenKeys.has("wasser") && <>
                  <Line type="monotone" dataKey="wasser" name="__gap_wasser" stroke={ENERGY_CHART_COLORS.wasser} strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="real_wasser" name="Wasser" stroke={ENERGY_CHART_COLORS.wasser} strokeWidth={2.5} dot={false} connectNulls={false} legendType="line" />
                </>}
                {/* Invisible lines for hidden keys so legend stays interactive */}
                {visibleEnergyKeys.includes("strom") && hiddenKeys.has("strom") && <Line type="monotone" dataKey="strom" name="Strom" stroke={ENERGY_CHART_COLORS.strom} strokeWidth={0} dot={false} legendType="line" />}
                {visibleEnergyKeys.includes("gas") && hiddenKeys.has("gas") && <Line type="monotone" dataKey="gas" name="Gas" stroke={ENERGY_CHART_COLORS.gas} strokeWidth={0} dot={false} legendType="line" />}
                {visibleEnergyKeys.includes("waerme") && hiddenKeys.has("waerme") && <Line type="monotone" dataKey="waerme" name="Wärme" stroke={ENERGY_CHART_COLORS.waerme} strokeWidth={0} dot={false} legendType="line" />}
                {visibleEnergyKeys.includes("wasser") && hiddenKeys.has("wasser") && <Line type="monotone" dataKey="wasser" name="Wasser" stroke={ENERGY_CHART_COLORS.wasser} strokeWidth={0} dot={false} legendType="line" />}
              </LineChart>
            ) : (
              <BarChart data={chartData} barGap={2} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} />
                <YAxis width={50} tick={tickStyle} tickLine={false} axisLine={false} domain={visibleKeys.length === 0 ? [0, 1] : ['auto', 'auto']} />
                <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                <Legend wrapperStyle={{ fontSize: 12, cursor: 'pointer' }} onClick={handleLegendClick} formatter={legendFormatter} />
                {visibleEnergyKeys.includes("strom") && <Bar dataKey="strom" name="Strom" fill={ENERGY_CHART_COLORS.strom} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("strom")} />}
                {visibleEnergyKeys.includes("gas") && <Bar dataKey="gas" name="Gas" fill={ENERGY_CHART_COLORS.gas} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("gas")} />}
                {visibleEnergyKeys.includes("waerme") && <Bar dataKey="waerme" name="Wärme" fill={ENERGY_CHART_COLORS.waerme} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("waerme")} />}
                {visibleEnergyKeys.includes("wasser") && <Bar dataKey="wasser" name="Wasser" fill={ENERGY_CHART_COLORS.wasser} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("wasser")} />}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default EnergyChart;
