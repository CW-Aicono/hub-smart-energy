import { useMemo } from "react";
import { useAnalyticsData, AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ComparisonBlockProps {
  block: AnalysisBlock;
  period: AnalyticsPeriod;
  offset: number;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
}

const CURRENT_COLOR = "#3b82f6";
const COMPARE_COLOR = "#94a3b8";

const OFFSET_LABELS: Record<number, string> = {
  [-1]: "Vorperiode",
  [-7]: "vor 7 Perioden",
  [-4]: "vor 4 Perioden",
};

export function ComparisonBlock({ block, period, onConfigChange }: ComparisonBlockProps) {
  const meterIds = (block.config.meterIds as string[]) ?? [];
  const compareOffset = (block.config.compareOffset as number) ?? -1;
  const { data: current, isLoading: l1 } = useAnalyticsData(meterIds, period, undefined, meterIds.length > 0, 0);
  const { data: previous, isLoading: l2 } = useAnalyticsData(meterIds, period, undefined, meterIds.length > 0, compareOffset);

  const chartData = useMemo(() => {
    if (!current || current.length === 0) return [];
    const currentSum = current[0]?.data.reduce((acc: Record<string, number>, p) => {
      acc[p.label] = (acc[p.label] ?? 0) + p.v;
      return acc;
    }, {}) ?? {};
    const prevData = previous?.[0]?.data ?? [];
    const prevSum = prevData.reduce((acc: Record<string, number>, p) => {
      acc[p.label] = (acc[p.label] ?? 0) + p.v;
      return acc;
    }, {});
    const labels = Array.from(new Set([...Object.keys(currentSum), ...Object.keys(prevSum)]));
    return labels.map((label) => ({
      label,
      Aktuell: Number(currentSum[label]?.toFixed(3) ?? 0),
      Vergleich: Number(prevSum[label]?.toFixed(3) ?? 0),
    }));
  }, [current, previous]);

  if (meterIds.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground">
        Ziehe Geräte hierher
      </div>
    );
  }

  if (l1 || l2) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Lade Daten...</div>;
  }

  if (chartData.length === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Keine Daten</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[10px] text-muted-foreground truncate">
          {current?.[0]?.label} — Aktuell vs. {OFFSET_LABELS[compareOffset] ?? `Offset ${compareOffset}`}
        </div>
        <Select
          value={String(compareOffset)}
          onValueChange={(v) => onConfigChange(block.id, { ...block.config, compareOffset: Number(v) })}
        >
          <SelectTrigger className="h-6 w-[140px] text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="-1">Vorperiode</SelectItem>
            <SelectItem value="-2">-2 Perioden</SelectItem>
            <SelectItem value="-4">-4 Perioden</SelectItem>
            <SelectItem value="-7">-7 Perioden</SelectItem>
            <SelectItem value="-12">-12 Perioden</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v) => Number(v).toLocaleString("de-DE")} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v: number) => Number(v).toLocaleString("de-DE", { maximumFractionDigits: 2 })}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Vergleich" fill={COMPARE_COLOR} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Aktuell" fill={CURRENT_COLOR} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
