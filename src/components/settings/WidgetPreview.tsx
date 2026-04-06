import { lazy, Suspense } from "react";
import { DashboardFilterProvider } from "@/hooks/useDashboardFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartType, CustomWidgetConfig, EnergyFlowNode, EnergyFlowConnection } from "@/hooks/useCustomWidgetDefinitions";
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
} from "recharts";

const EnergyFlowMonitor = lazy(() => import("@/components/dashboard/EnergyFlowMonitor"));

const PRESET_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function generateDemoData(meterCount: number, period?: string) {
  if (period === "day") {
    return Array.from({ length: 24 }, (_, h) => {
      const point: Record<string, string | number> = { name: `${h}:00` };
      for (let i = 0; i < meterCount; i++) {
        point[`meter_${i}`] = Math.round(50 + Math.random() * 200);
      }
      return point;
    });
  }
  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  return days.map((day) => {
    const point: Record<string, string | number> = { name: day };
    for (let i = 0; i < meterCount; i++) {
      point[`meter_${i}`] = Math.round(50 + Math.random() * 200);
    }
    return point;
  });
}

interface WidgetPreviewProps {
  name: string;
  chartType: ChartType;
  color: string;
  config: CustomWidgetConfig;
  previewPeriod?: string;
}

export function WidgetPreview({ name, chartType, color, config, previewPeriod }: WidgetPreviewProps) {
  const meterCount = Math.max(config.meter_ids.length, 1);
  const demoData = generateDemoData(meterCount, previewPeriod);

  const ICON_MAP: Record<string, React.ReactNode> = {
    line: <LineChart className="h-4 w-4" />,
    bar: <BarChart3 className="h-4 w-4" />,
    gauge: <Gauge className="h-4 w-4" />,
    kpi: <Activity className="h-4 w-4" />,
    table: <Table2 className="h-4 w-4" />,
    energyflow: <GitBranch className="h-4 w-4" />,
  };

  const getSeriesColor = (idx: number) => {
    const mid = config.meter_ids[idx];
    if (mid && config.series_colors[mid]) return config.series_colors[mid];
    return PRESET_COLORS[idx % PRESET_COLORS.length];
  };

  const flowNodes: EnergyFlowNode[] = config.energy_flow_nodes ?? [];
  const flowConns: EnergyFlowConnection[] = config.energy_flow_connections ?? [];

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span style={{ color }}>{ICON_MAP[chartType]}</span>
          {name || "Unbenanntes Widget"}
          <span className="text-xs text-muted-foreground ml-auto">{config.unit}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartType === "energyflow" && (
          <DashboardFilterProvider>
            <Suspense fallback={<div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Laden…</div>}>
              <EnergyFlowMonitor nodes={flowNodes} connections={flowConns} />
            </Suspense>
          </DashboardFilterProvider>
        )}

        {(chartType === "line" || chartType === "bar") && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "line" ? (
                <RLineChart data={demoData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    domain={[config.y_range.min ?? "auto", config.y_range.max ?? "auto"]}
                    className="text-muted-foreground"
                  />
                  <Tooltip />
                  {Array.from({ length: meterCount }).map((_, i) => (
                    <Line
                      key={i}
                      type="monotone"
                      dataKey={`meter_${i}`}
                      stroke={getSeriesColor(i)}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                  {config.thresholds.map((t, i) => (
                    <ReferenceLine key={i} y={t.value} stroke={t.color} strokeDasharray="5 5" label={t.label} />
                  ))}
                </RLineChart>
              ) : (
                <RBarChart data={demoData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    domain={[config.y_range.min ?? "auto", config.y_range.max ?? "auto"]}
                    className="text-muted-foreground"
                  />
                  <Tooltip />
                  {Array.from({ length: meterCount }).map((_, i) => (
                    <Bar key={i} dataKey={`meter_${i}`} fill={getSeriesColor(i)} radius={[2, 2, 0, 0]} />
                  ))}
                  {config.thresholds.map((t, i) => (
                    <ReferenceLine key={i} y={t.value} stroke={t.color} strokeDasharray="5 5" label={t.label} />
                  ))}
                </RBarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {chartType === "gauge" && (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <div className="text-5xl font-bold tabular-nums" style={{ color }}>
                {Math.round(50 + Math.random() * 200)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">{config.unit}</div>
            </div>
          </div>
        )}

        {chartType === "kpi" && (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <div className="text-4xl font-bold tabular-nums" style={{ color }}>
                {Math.round(100 + Math.random() * 500)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">{config.unit}</div>
              <div className="flex items-center justify-center gap-1 mt-2 text-emerald-500 text-sm font-medium">
                ↓ 12%
                <span className="text-muted-foreground font-normal">vs. Vorperiode</span>
              </div>
            </div>
          </div>
        )}

        {chartType === "table" && (
          <div className="h-48 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 text-muted-foreground font-medium">Zähler</th>
                  <th className="text-right py-1.5 text-muted-foreground font-medium">Wert</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: meterCount }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1.5">Zähler {i + 1}</td>
                    <td className="text-right py-1.5 tabular-nums">
                      {Math.round(50 + Math.random() * 200)} {config.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
