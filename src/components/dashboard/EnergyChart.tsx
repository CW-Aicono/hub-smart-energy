import { useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ENERGY_CHART_COLORS } from "@/lib/energyTypeColors";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  addDays, addWeeks, addMonths, addQuarters, addYears,
  eachDayOfInterval, getISOWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";

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

function getPeriodRange(period: ChartPeriod, ref: Date): [Date, Date] {
  switch (period) {
    case "day": return [startOfDay(ref), endOfDay(ref)];
    case "week": return [startOfWeek(ref, { weekStartsOn: 1 }), endOfWeek(ref, { weekStartsOn: 1 })];
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
    if (energyType === "gas") return "m³";
    return "kW";
  }
  if (energyType === "wasser") return "m³";
  if (energyType === "gas") return "m³";
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
  const { readings, loading, hasData } = useEnergyData(locationId);
  const { meters } = useMeters();
  const { selectedPeriod, setSelectedPeriod } = useDashboardFilter();
  const [offset, setOffset] = useState(0);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  // Map "all" to "year" for this chart
  const period: ChartPeriod = selectedPeriod === "all" ? "year" : selectedPeriod;

  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const subtitle = selectedLocation ? `Daten für: ${selectedLocation.name}` : "Alle Liegenschaften";

  const meterMap = useMemo(() => {
    const map: Record<string, string> = {};
    meters.forEach((m) => { map[m.id] = m.energy_type; });
    return map;
  }, [meters]);

  const refDate = getRefDate(period, offset);
  const [rangeStart, rangeEnd] = getPeriodRange(period, refDate);
  const periodLabel = getPeriodLabel(period, refDate);
  const canGoForward = offset < 0;

  const chartData = useMemo(() => {
    const filtered = readings.filter((r) => {
      const d = new Date(r.reading_date);
      return d >= rangeStart && d <= rangeEnd;
    });

    const emptyBucket = () => ({ strom: 0, gas: 0, waerme: 0, wasser: 0 });

    const addToBucket = (bucket: any, r: { meter_id: string; value: number }) => {
      const et = meterMap[r.meter_id] || "strom";
      if (et in bucket) bucket[et] += r.value;
    };

    if (period === "day") {
      // 24 hourly buckets – values represent average power (kW) in each hour
      const buckets = Array.from({ length: 24 }, (_, h) => ({
        label: `${h}:00`,
        ...emptyBucket(),
      }));
      filtered.forEach((r) => {
        const hour = new Date(r.reading_date).getHours();
        addToBucket(buckets[hour], r);
      });
      return buckets;
    }

    if (period === "week") {
      const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      return days.map((d, i) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const bucket = { label: dayNames[i] || format(d, "EEE", { locale: de }), ...emptyBucket() };
        filtered.forEach((r) => {
          if (format(new Date(r.reading_date), "yyyy-MM-dd") === dateStr) {
            addToBucket(bucket, r);
          }
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
          if (format(new Date(r.reading_date), "yyyy-MM-dd") === dateStr) {
            addToBucket(bucket, r);
          }
        });
        return bucket;
      });
    }

    if (period === "quarter") {
      // Group by ISO week
      const weekMap = new Map<number, { label: string; strom: number; gas: number; waerme: number; wasser: number }>();
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      days.forEach((d) => {
        const wk = getISOWeek(d);
        if (!weekMap.has(wk)) {
          weekMap.set(wk, { label: `KW${wk}`, ...emptyBucket() });
        }
      });
      filtered.forEach((r) => {
        const wk = getISOWeek(new Date(r.reading_date));
        const bucket = weekMap.get(wk);
        if (bucket) addToBucket(bucket, r);
      });
      return Array.from(weekMap.values());
    }

    // year – 12 monthly buckets
    const monthLabels = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    const buckets = monthLabels.map((m) => ({ label: m, ...emptyBucket() }));
    filtered.forEach((r) => {
      const month = new Date(r.reading_date).getMonth();
      addToBucket(buckets[month], r);
    });
    return buckets;
  }, [readings, meterMap, period, rangeStart.toISOString(), rangeEnd.toISOString()]);

  // Reset offset when period changes
  const handlePeriodChange = (v: string) => {
    setOffset(0);
    if (v === "day" || v === "week" || v === "month" || v === "quarter" || v === "year") {
      setSelectedPeriod(v as TimePeriod);
    }
  };

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[300px]" /></CardContent></Card>;

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
                <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} interval={2} />
                <YAxis width={50} tick={tickStyle} tickLine={false} axisLine={false} domain={visibleKeys.length === 0 ? [0, 1] : ['auto', 'auto']} />
                <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                <Legend wrapperStyle={{ fontSize: 12, cursor: 'pointer' }} onClick={handleLegendClick} formatter={legendFormatter} />
                <Line type="monotone" dataKey="strom" name="Strom" stroke={ENERGY_CHART_COLORS.strom} strokeWidth={2} dot={false} hide={hiddenKeys.has("strom")} />
                <Line type="monotone" dataKey="gas" name="Gas" stroke={ENERGY_CHART_COLORS.gas} strokeWidth={2} dot={false} hide={hiddenKeys.has("gas")} />
                <Line type="monotone" dataKey="waerme" name="Wärme" stroke={ENERGY_CHART_COLORS.waerme} strokeWidth={2} dot={false} hide={hiddenKeys.has("waerme")} />
                <Line type="monotone" dataKey="wasser" name="Wasser" stroke={ENERGY_CHART_COLORS.wasser} strokeWidth={2} dot={false} hide={hiddenKeys.has("wasser")} />
              </LineChart>
            ) : (
              <BarChart data={chartData} barGap={2} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} />
                <YAxis width={50} tick={tickStyle} tickLine={false} axisLine={false} domain={visibleKeys.length === 0 ? [0, 1] : ['auto', 'auto']} />
                <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                <Legend wrapperStyle={{ fontSize: 12, cursor: 'pointer' }} onClick={handleLegendClick} formatter={legendFormatter} />
                <Bar dataKey="strom" name="Strom" fill={ENERGY_CHART_COLORS.strom} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("strom")} />
                <Bar dataKey="gas" name="Gas" fill={ENERGY_CHART_COLORS.gas} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("gas")} />
                <Bar dataKey="waerme" name="Wärme" fill={ENERGY_CHART_COLORS.waerme} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("waerme")} />
                <Bar dataKey="wasser" name="Wasser" fill={ENERGY_CHART_COLORS.wasser} radius={[3, 3, 0, 0]} hide={hiddenKeys.has("wasser")} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default EnergyChart;
