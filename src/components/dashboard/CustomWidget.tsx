import { useMemo, useState, useCallback, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CustomWidgetDefinition, ChartType } from "@/hooks/useCustomWidgetDefinitions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, LineChart, Gauge, Activity, Table2, GitBranch, ChevronLeft, ChevronRight } from "lucide-react";
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  addDays, addWeeks, addMonths, addQuarters, addYears, getISOWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  BarChart as RBarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";

const EnergyFlowMonitor = lazy(() => import("./EnergyFlowMonitor"));
const DAY_BUCKET_MINUTES = 5;
const DAY_AXIS_INTERVAL = 11;

const PRESET_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

const ICON_MAP: Record<string, React.ReactNode> = {
  line: <LineChart className="h-4 w-4" />,
  bar: <BarChart3 className="h-4 w-4" />,
  gauge: <Gauge className="h-4 w-4" />,
  kpi: <Activity className="h-4 w-4" />,
  table: <Table2 className="h-4 w-4" />,
  energyflow: <GitBranch className="h-4 w-4" />,
};

function formatTimeLabel(hours: number, minutes: number): string {
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

function buildDayTimeline(): string[] {
  const labels: string[] = [];
  for (let totalMinutes = 0; totalMinutes <= 24 * 60; totalMinutes += DAY_BUCKET_MINUTES) {
    labels.push(formatTimeLabel(Math.floor(totalMinutes / 60), totalMinutes % 60));
  }
  return labels;
}

function getDayBucketLabel(date: Date): string {
  const roundedMinutes = Math.floor(date.getMinutes() / DAY_BUCKET_MINUTES) * DAY_BUCKET_MINUTES;
  return formatTimeLabel(date.getHours(), roundedMinutes);
}

function normalizePowerUnit(unit?: string | null, energyType?: string | null, fallback?: string | null): string {
  if (unit === "Wh") return "W";
  if (unit === "kWh") return "kW";
  if (unit === "m³") return "m³/h";
  if (unit) return unit;
  if (energyType === "gas" || energyType === "wasser") return "m³/h";
  if (fallback === "kWh") return "kW";
  return fallback || "kW";
}

/** Compute date range from the dashboard time period and offset */
function getDateRange(period: TimePeriod, offset: number): { from: Date; to: Date } {
  const now = new Date();
  let base: Date;
  switch (period) {
    case "day": base = addDays(now, offset); return { from: startOfDay(base), to: endOfDay(base) };
    case "week": base = addWeeks(now, offset); return { from: startOfWeek(base, { weekStartsOn: 1 }), to: endOfWeek(base, { weekStartsOn: 1 }) };
    case "month": base = addMonths(now, offset); return { from: startOfMonth(base), to: endOfMonth(base) };
    case "quarter": base = addQuarters(now, offset); return { from: startOfQuarter(base), to: endOfQuarter(base) };
    case "year": base = addYears(now, offset); return { from: startOfYear(base), to: endOfYear(base) };
    case "all":
    default: {
      const from = new Date(now);
      from.setFullYear(from.getFullYear() - 5);
      return { from, to: now };
    }
  }
}

function getPeriodLabel(period: TimePeriod, offset: number): string {
  const now = new Date();
  let base: Date;
  switch (period) {
    case "day": base = addDays(now, offset); return format(base, "EEEE, d. MMM yyyy", { locale: de });
    case "week": base = addWeeks(now, offset); return `KW ${getISOWeek(base)}, ${format(base, "yyyy")}`;
    case "month": base = addMonths(now, offset); return format(base, "MMMM yyyy", { locale: de });
    case "quarter": base = addQuarters(now, offset); return `Q${Math.floor(base.getMonth() / 3) + 1} ${format(base, "yyyy")}`;
    case "year": base = addYears(now, offset); return format(base, "yyyy");
    default: return "";
  }
}

/** Format a date label appropriate to the selected time period */
function formatLabel(d: Date, period: TimePeriod): string {
  switch (period) {
    case "day":
      return `${d.getHours()}:00`;
    case "week":
      return d.toLocaleDateString("de-DE", { weekday: "short" });
    case "month":
    case "quarter":
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    case "year":
      return d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
    case "all":
      return d.toLocaleDateString("de-DE", { month: "2-digit", year: "2-digit" });
    default:
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  }
}

/** Custom tooltip for the day view with German number formatting */
function DayTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover p-2 text-popover-foreground shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value != null ? entry.value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–"} {unit}
        </p>
      ))}
    </div>
  );
}

interface CustomWidgetProps {
  definition: CustomWidgetDefinition;
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: "day", label: "Tag" },
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "quarter", label: "Quartal" },
  { value: "year", label: "Jahr" },
];

export default function CustomWidget({ definition, locationId }: CustomWidgetProps) {
  const { config, name, color } = definition;
  const { selectedPeriod, setSelectedPeriod, selectedOffset: offset, setSelectedOffset: setOffset } = useDashboardFilter();
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const handleLegendClick = useCallback((e: any) => {
    const key = e.dataKey;
    if (!key) return;
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Resolve chart type for current period
  const activeChartType: ChartType =
    config.chart_type_per_period?.[selectedPeriod] ?? definition.chart_type;

  const { from, to } = useMemo(() => getDateRange(selectedPeriod, offset), [selectedPeriod, offset]);
  const periodLabel = useMemo(() => getPeriodLabel(selectedPeriod, offset), [selectedPeriod, offset]);
  const canGoForward = offset < 0;

  const { data: meterDetails = {} } = useQuery({
    queryKey: ["meter-details", config.meter_ids],
    queryFn: async () => {
      if (!config.meter_ids.length) return {};
      const { data } = await supabase
        .from("meters")
        .select("id, name, unit, source_unit_power, energy_type")
        .in("id", config.meter_ids);
      return Object.fromEntries((data ?? []).map((m) => [m.id, m]));
    },
    enabled: config.meter_ids.length > 0,
  });

  const displayUnit = useMemo(() => {
    if (selectedPeriod !== "day") return config.unit;
    const primaryMeter = config.meter_ids.map((meterId) => meterDetails[meterId]).find(Boolean) as
      | { unit?: string | null; source_unit_power?: string | null; energy_type?: string | null }
      | undefined;

    return normalizePowerUnit(
      primaryMeter?.source_unit_power ?? primaryMeter?.unit,
      primaryMeter?.energy_type,
      config.unit,
    );
  }, [config.meter_ids, config.unit, meterDetails, selectedPeriod]);

  // Fetch data: 5-min readings for "day", daily totals otherwise
  const { data: chartData = [], isLoading } = useQuery({
    queryKey: ["custom-widget-data", definition.id, config.meter_ids, locationId, selectedPeriod, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      if (!config.meter_ids.length) return [];

      if (selectedPeriod === "day") {
        const timeline = buildDayTimeline();
        const valuesByBucket = Object.fromEntries(
          timeline.map((label) => [label, {} as Record<string, number[]>]),
        );

        const aggregatedRows: Array<{ meter_id: string; power_avg: number; bucket: string }> = [];
        const pageSize = 1000;
        let pageFrom = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .rpc("get_power_readings_5min", {
              p_meter_ids: config.meter_ids,
              p_start: from.toISOString(),
              p_end: to.toISOString(),
            })
            .range(pageFrom, pageFrom + pageSize - 1);

          if (error) throw error;
          if (!data || data.length === 0) break;

          aggregatedRows.push(...(data as Array<{ meter_id: string; power_avg: number; bucket: string }>));
          hasMore = data.length === pageSize;
          pageFrom += pageSize;
        }

        let mergedRows = aggregatedRows.map((row) => ({
          meter_id: row.meter_id,
          value: row.power_avg,
          recorded_at: row.bucket,
        }));

        // Recent raw data: fetch last 15 minutes to cover gap between
        // last compaction run and now (the RPC already handles on-the-fly
        // aggregation, but may miss the very latest readings still being written)
        const recentCutoff = new Date(Date.now() - 15 * 60 * 1000);
        const recentPages: Array<{ meter_id: string; power_value: number; recorded_at: string }> = [];
        let recentFrom = 0;
        const recentPageSize = 1000;
        let recentHasMore = true;

        while (recentHasMore) {
          const { data: recentRaw, error: recentError } = await supabase
            .from("meter_power_readings")
            .select("meter_id, power_value, recorded_at")
            .in("meter_id", config.meter_ids)
            .gte("recorded_at", recentCutoff.toISOString())
            .lte("recorded_at", to.toISOString())
            .order("recorded_at", { ascending: true })
            .range(recentFrom, recentFrom + recentPageSize - 1);

          if (recentError) throw recentError;
          if (!recentRaw || recentRaw.length === 0) break;
          recentPages.push(...recentRaw);
          recentHasMore = recentRaw.length === recentPageSize;
          recentFrom += recentPageSize;
        }

        if (recentPages.length) {
          mergedRows = mergedRows.filter((row) => new Date(row.recorded_at) < recentCutoff);
          mergedRows.push(
            ...recentPages.map((row) => ({
              meter_id: row.meter_id,
              value: row.power_value,
              recorded_at: row.recorded_at,
            })),
          );
        }

        for (const row of mergedRows) {
          const label = getDayBucketLabel(new Date(row.recorded_at));
          if (!valuesByBucket[label]) continue;
          if (!valuesByBucket[label][row.meter_id]) valuesByBucket[label][row.meter_id] = [];
          valuesByBucket[label][row.meter_id].push(row.value);
        }

        return timeline.map((label) => {
          const entry: Record<string, string | number | null> = { name: label };
          for (const meterId of config.meter_ids) {
            const bucketValues = valuesByBucket[label][meterId];
            entry[meterId] = bucketValues?.length
              ? bucketValues.reduce((sum, value) => sum + value, 0) / bucketValues.length
              : null;
          }
          return entry;
        });
      }

      // Non-day periods: use daily totals
      const { data } = await supabase.rpc("get_meter_daily_totals", {
        p_meter_ids: config.meter_ids,
        p_from_date: from.toISOString().split("T")[0],
        p_to_date: to.toISOString().split("T")[0],
      });
      if (!data) return [];

      // Group by day
      const dayMap: Record<string, Record<string, number>> = {};
      for (const row of data) {
        const d = new Date(row.day);
        const label = formatLabel(d, selectedPeriod);
        if (!dayMap[label]) dayMap[label] = {};
        dayMap[label][row.meter_id] = (dayMap[label][row.meter_id] ?? 0) + row.total_value;
      }

      return Object.entries(dayMap).map(([day, meters]) => ({
        name: day,
        ...meters,
      }));
    },
    enabled: config.meter_ids.length > 0,
    staleTime: selectedPeriod === "day" ? 30 * 1000 : 5 * 60 * 1000,
    refetchInterval: selectedPeriod === "day" ? 60 * 1000 : false,
  });

  const yDomain = useMemo<[number | "auto", number | "auto"]>(() => {
    const hasNegativeValues = chartData.some((row: any) =>
      config.meter_ids.some((meterId) => typeof row[meterId] === "number" && row[meterId] < 0),
    );

    // Always use "auto" for min when negative values exist, regardless of config
    if (hasNegativeValues) {
      return ["auto", config.y_range?.max ?? "auto"];
    }

    return [config.y_range?.min ?? "auto", config.y_range?.max ?? "auto"];
  }, [chartData, config.meter_ids, config.y_range?.max, config.y_range?.min]);

  const getSeriesColor = (idx: number) => {
    const mid = config.meter_ids[idx];
    if (mid && config.series_colors?.[mid]) return config.series_colors[mid];
    return PRESET_COLORS[idx % PRESET_COLORS.length];
  };

  // Compute single KPI value
  const kpiValue = useMemo(() => {
    if (activeChartType !== "kpi" && activeChartType !== "gauge") return 0;
    const allValues = chartData.flatMap((d: any) =>
      config.meter_ids.map((mid) => (d[mid] as number) || 0)
    );
    if (!allValues.length) return 0;
    switch (config.aggregation) {
      case "sum": return allValues.reduce((a, b) => a + b, 0);
      case "avg": return allValues.reduce((a, b) => a + b, 0) / allValues.length;
      case "max": return Math.max(...allValues);
      case "min": return Math.min(...allValues);
      default: return allValues.reduce((a, b) => a + b, 0);
    }
  }, [chartData, config, activeChartType]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <span style={{ color }}>{ICON_MAP[activeChartType]}</span>
            {name}
            <span className="text-xs text-muted-foreground">{displayUnit}</span>
          </CardTitle>
          <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as TimePeriod)}>
            <SelectTrigger className="w-[100px] h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedPeriod !== "all" && (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOffset((o) => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[140px] text-center">{periodLabel}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canGoForward} onClick={() => setOffset((o) => o + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Laden…</div>
          </div>
        ) : (
          <>
            {(activeChartType === "line" || activeChartType === "bar") && (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  {activeChartType === "line" ? (
                    <RLineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        interval={selectedPeriod === "day" ? DAY_AXIS_INTERVAL : "preserveStartEnd"}
                        tickFormatter={(value: string) =>
                          selectedPeriod === "day"
                            ? (value.endsWith(":00") && value !== "24:00" ? value : "")
                            : value
                        }
                      />
                      <YAxis tick={{ fontSize: 11 }} domain={yDomain} allowDataOverflow={false} />
                      <Tooltip content={selectedPeriod === "day" ? <DayTooltip unit={displayUnit} /> : undefined} formatter={selectedPeriod !== "day" ? (v: number) => v?.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + displayUnit : undefined} />
                      <Legend content={() => null} />
                      {config.meter_ids.map((mid, i) => (
                        <Line key={mid} type="monotone" dataKey={mid} name={meterDetails[mid]?.name || `Zähler ${i + 1}`} stroke={getSeriesColor(i)} strokeWidth={2} dot={false} connectNulls={true} hide={hiddenSeries.has(mid)} />
                      ))}
                      {(config.thresholds || []).map((t, i) => (
                        <ReferenceLine key={i} y={t.value} stroke={t.color} strokeDasharray="5 5" label={t.label} />
                      ))}
                    </RLineChart>
                  ) : (
                    <RBarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        interval={selectedPeriod === "day" ? DAY_AXIS_INTERVAL : "preserveStartEnd"}
                        tickFormatter={(value: string) =>
                          selectedPeriod === "day"
                            ? (value.endsWith(":00") && value !== "24:00" ? value : "")
                            : value
                        }
                      />
                      <YAxis tick={{ fontSize: 11 }} domain={yDomain} allowDataOverflow={false} />
                      <Tooltip content={selectedPeriod === "day" ? <DayTooltip unit={displayUnit} /> : undefined} formatter={selectedPeriod !== "day" ? (v: number) => v?.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + displayUnit : undefined} />
                      <Legend content={() => null} />
                      {config.meter_ids.map((mid, i) => (
                        <Bar key={mid} dataKey={mid} name={meterDetails[mid]?.name || `Zähler ${i + 1}`} fill={getSeriesColor(i)} radius={[2, 2, 0, 0]} hide={hiddenSeries.has(mid)} />
                      ))}
                      {(config.thresholds || []).map((t, i) => (
                        <ReferenceLine key={i} y={t.value} stroke={t.color} strokeDasharray="5 5" label={t.label} />
                      ))}
                    </RBarChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                {config.meter_ids.map((mid, i) => {
                  const hidden = hiddenSeries.has(mid);
                  return (
                    <button
                      key={mid}
                      onClick={() => handleLegendClick({ dataKey: mid })}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        hidden
                          ? "border-muted text-muted-foreground opacity-50"
                          : "border-input hover:bg-accent"
                      )}
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: hidden ? "hsl(var(--muted-foreground))" : getSeriesColor(i) }}
                      />
                      {meterDetails[mid]?.name || `Zähler ${i + 1}`}
                    </button>
                  );
                })}
              </div>
            )}

            {activeChartType === "gauge" && (
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <div className="text-5xl font-bold tabular-nums" style={{ color }}>
                    {Math.round(kpiValue).toLocaleString("de-DE")}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{displayUnit}</div>
                </div>
              </div>
            )}

            {activeChartType === "kpi" && (
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <div className="text-4xl font-bold tabular-nums" style={{ color }}>
                    {Math.round(kpiValue).toLocaleString("de-DE")}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{displayUnit}</div>
                </div>
              </div>
            )}

            {activeChartType === "table" && (
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1.5 text-muted-foreground font-medium">Tag</th>
                      {config.meter_ids.map((mid, i) => (
                        <th key={mid} className="text-right py-1.5 text-muted-foreground font-medium">
                          {meterDetails[mid]?.name || `Zähler ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row: any, idx: number) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-1.5">{row.name}</td>
                        {config.meter_ids.map((mid) => (
                          <td key={mid} className="text-right py-1.5 tabular-nums">
                            {(row[mid] as number)?.toLocaleString("de-DE", { maximumFractionDigits: 1 }) ?? "–"} {displayUnit}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeChartType === "energyflow" && (
              <Suspense fallback={<div className="h-72 flex items-center justify-center text-muted-foreground text-sm">Laden…</div>}>
                <EnergyFlowMonitor
                  nodes={config.energy_flow_nodes || []}
                  connections={config.energy_flow_connections || []}
                />
              </Suspense>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
