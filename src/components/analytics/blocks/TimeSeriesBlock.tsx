import { useMemo } from "react";
import { useAnalyticsData, AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface TimeSeriesBlockProps {
  block: AnalysisBlock;
  period: AnalyticsPeriod;
  offset: number;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function TimeSeriesBlock({ block, period, offset }: TimeSeriesBlockProps) {
  const meterIds = (block.config.meterIds as string[]) ?? [];
  const showArea = (block.config.showArea as boolean) ?? false;
  const { data: series, isLoading } = useAnalyticsData(meterIds, period, undefined, meterIds.length > 0);
  const [configOpen, setConfigOpen] = useState(false);

  const chartData = useMemo(() => {
    if (!series || series.length === 0) return [];
    const timeMap: Record<number, Record<string, number | string>> = {};
    const keys: string[] = [];
    series.forEach((s, idx) => {
      const key = `s${idx}`;
      keys.push(key);
      s.data.forEach((p) => {
        if (!timeMap[p.t]) timeMap[p.t] = { t: p.t, label: p.label };
        timeMap[p.t][key] = p.v;
      });
    });
    return Object.values(timeMap).sort((a: any, b: any) => a.t - b.t);
  }, [series]);

  if (meterIds.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground">
        Ziehe Geräte hierher
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Lade Daten...</div>;
  }

  if (!series || series.length === 0 || chartData.length === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Keine Daten im Zeitraum</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-muted-foreground">
          {series.map((s) => `${s.label} (${s.unit})`).join(" · ")}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setConfigOpen(true)}>
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(value: number, name: string) => {
                const idx = Number(name.replace("s", ""));
                const s = series[idx];
                return [value.toLocaleString("de-DE", { maximumFractionDigits: 2 }), s?.label ?? name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s, idx) => (
              <Line
                key={s.meterId}
                type="monotone"
                dataKey={`s${idx}`}
                name={s.label}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Block-Einstellungen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs text-muted-foreground">{meterIds.length} Gerät(e) zugeordnet</div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
