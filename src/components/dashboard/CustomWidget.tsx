import { useMemo, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomWidgetDefinition, ChartType } from "@/hooks/useCustomWidgetDefinitions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";
import { BarChart3, LineChart, Gauge, Activity, Table2, GitBranch } from "lucide-react";
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

/** Compute date range from the dashboard time period */
function getDateRange(period: TimePeriod): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now);
  switch (period) {
    case "day":
      from.setHours(0, 0, 0, 0);
      break;
    case "week":
      from.setDate(from.getDate() - 7);
      break;
    case "month":
      from.setMonth(from.getMonth() - 1);
      break;
    case "quarter":
      from.setMonth(from.getMonth() - 3);
      break;
    case "year":
      from.setFullYear(from.getFullYear() - 1);
      break;
    case "all":
      from.setFullYear(from.getFullYear() - 5);
      break;
  }
  return { from, to: now };
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

interface CustomWidgetProps {
  definition: CustomWidgetDefinition;
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

export default function CustomWidget({ definition, locationId }: CustomWidgetProps) {
  const { config, name, color } = definition;
  const { selectedPeriod } = useDashboardFilter();

  // Resolve chart type for current period
  const activeChartType: ChartType =
    config.chart_type_per_period?.[selectedPeriod] ?? definition.chart_type;

  const { from, to } = useMemo(() => getDateRange(selectedPeriod), [selectedPeriod]);

  // Fetch meter names for legend
  const { data: meterNames = {} } = useQuery({
    queryKey: ["meter-names", config.meter_ids],
    queryFn: async () => {
      if (!config.meter_ids.length) return {};
      const { data } = await supabase
        .from("meters")
        .select("id, name")
        .in("id", config.meter_ids);
      return Object.fromEntries((data ?? []).map((m) => [m.id, m.name]));
    },
    enabled: config.meter_ids.length > 0,
  });

  // Fetch data: 5-min readings for "day", daily totals otherwise
  const { data: chartData = [], isLoading } = useQuery({
    queryKey: ["custom-widget-data", definition.id, config.meter_ids, locationId, selectedPeriod],
    queryFn: async () => {
      if (!config.meter_ids.length) return [];

      if (selectedPeriod === "day") {
        // Fetch 5-min power readings for today and aggregate to hourly
        const { data } = await supabase
          .from("meter_power_readings_5min")
          .select("meter_id, bucket, power_avg")
          .in("meter_id", config.meter_ids)
          .gte("bucket", from.toISOString())
          .lt("bucket", to.toISOString())
          .order("bucket", { ascending: true });

        if (!data) return [];

        // Group into hourly buckets
        const hourMap: Record<string, Record<string, number[]>> = {};
        for (const row of data) {
          const d = new Date(row.bucket);
          const hourLabel = `${d.getHours()}:00`;
          if (!hourMap[hourLabel]) hourMap[hourLabel] = {};
          if (!hourMap[hourLabel][row.meter_id]) hourMap[hourLabel][row.meter_id] = [];
          hourMap[hourLabel][row.meter_id].push(row.power_avg);
        }

        // Build chart data with hourly averages (kW), fill all 24h
        const result: any[] = [];
        for (let h = 0; h < 24; h++) {
          const label = `${h}:00`;
          const entry: any = { name: label };
          const bucket = hourMap[label];
          for (const mid of config.meter_ids) {
            if (bucket?.[mid]?.length) {
              // Average power in kW for the hour
              const avg = bucket[mid].reduce((a, b) => a + b, 0) / bucket[mid].length;
              entry[mid] = avg;
            } else {
              entry[mid] = null;
            }
          }
          result.push(entry);
        }
        return result;
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
    staleTime: 5 * 60 * 1000,
  });

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
        <CardTitle className="text-sm flex items-center gap-2">
          <span style={{ color }}>{ICON_MAP[activeChartType]}</span>
          {name}
          <span className="text-xs text-muted-foreground ml-auto">{config.unit}</span>
        </CardTitle>
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
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[config.y_range?.min ?? "auto", config.y_range?.max ?? "auto"]} />
                      <Tooltip />
                      <Legend />
                      {config.meter_ids.map((mid, i) => (
                        <Line key={mid} type="monotone" dataKey={mid} name={meterNames[mid] || `Zähler ${i + 1}`} stroke={getSeriesColor(i)} strokeWidth={2} dot={false} />
                      ))}
                      {(config.thresholds || []).map((t, i) => (
                        <ReferenceLine key={i} y={t.value} stroke={t.color} strokeDasharray="5 5" label={t.label} />
                      ))}
                    </RLineChart>
                  ) : (
                    <RBarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[config.y_range?.min ?? "auto", config.y_range?.max ?? "auto"]} />
                      <Tooltip />
                      <Legend />
                      {config.meter_ids.map((mid, i) => (
                        <Bar key={mid} dataKey={mid} name={meterNames[mid] || `Zähler ${i + 1}`} fill={getSeriesColor(i)} radius={[2, 2, 0, 0]} />
                      ))}
                      {(config.thresholds || []).map((t, i) => (
                        <ReferenceLine key={i} y={t.value} stroke={t.color} strokeDasharray="5 5" label={t.label} />
                      ))}
                    </RBarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}

            {activeChartType === "gauge" && (
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <div className="text-5xl font-bold tabular-nums" style={{ color }}>
                    {Math.round(kpiValue).toLocaleString("de-DE")}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{config.unit}</div>
                </div>
              </div>
            )}

            {activeChartType === "kpi" && (
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <div className="text-4xl font-bold tabular-nums" style={{ color }}>
                    {Math.round(kpiValue).toLocaleString("de-DE")}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{config.unit}</div>
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
                          {meterNames[mid] || `Zähler ${i + 1}`}
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
                            {(row[mid] as number)?.toLocaleString("de-DE", { maximumFractionDigits: 1 }) ?? "–"} {config.unit}
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
