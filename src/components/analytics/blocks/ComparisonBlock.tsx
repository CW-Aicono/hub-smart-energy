import { useMemo } from "react";
import { useAnalyticsData, AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface ComparisonBlockProps {
  block: AnalysisBlock;
  period: AnalyticsPeriod;
  offset: number;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

export function ComparisonBlock({ block, period }: ComparisonBlockProps) {
  const meterIds = (block.config.meterIds as string[]) ?? [];
  const compareOffset = (block.config.compareOffset as number) ?? -1;
  const { data: currentSeries } = useAnalyticsData(meterIds, period, undefined, meterIds.length > 0);
  const { data: compareSeries } = useAnalyticsData(meterIds, period, undefined, meterIds.length > 0);

  const chartData = useMemo(() => {
    if (!currentSeries || currentSeries.length === 0) return [];
    const map: Record<string, Record<string, number | string>> = {};
    currentSeries.forEach((s, idx) => {
      s.data.forEach((p) => {
        const key = `Aktuell ${s.label}`;
        if (!map[p.label]) map[p.label] = { label: p.label };
        map[p.label][key] = p.v;
      });
    });
    return Object.values(map);
  }, [currentSeries]);

  if (meterIds.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground">
        Ziehe Geräte hierher
      </div>
    );
  }

  if (!currentSeries || currentSeries.length === 0 || chartData.length === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Keine Daten</div>;
  }

  const keys = Object.keys(chartData[0]).filter((k) => k !== "label");

  return (
    <div className="h-full flex flex-col">
      <div className="text-[10px] text-muted-foreground mb-2">Vergleich aktueller Zeitraum</div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            {keys.map((k, idx) => (
              <Bar key={k} dataKey={k} fill={COLORS[idx % COLORS.length]} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
