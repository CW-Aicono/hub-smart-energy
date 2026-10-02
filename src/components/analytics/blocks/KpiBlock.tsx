import { useMemo } from "react";
import { useAnalyticsData, AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiBlockProps {
  block: AnalysisBlock;
  period: AnalyticsPeriod;
  offset: number;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
}

export function KpiBlock({ block, period }: KpiBlockProps) {
  const meterIds = (block.config.meterIds as string[]) ?? [];
  const { data: series, isLoading } = useAnalyticsData(meterIds, period, undefined, meterIds.length > 0);

  const stats = useMemo(() => {
    if (!series || series.length === 0) return [];
    return series.map((s) => {
      const values = s.data.map((d) => d.v).filter((v) => Number.isFinite(v));
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = values.length ? sum / values.length : 0;
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 0;
      const last = values.length ? values[values.length - 1] : 0;
      const prev = values.length > 1 ? values[values.length - 2] : last;
      const delta = prev !== 0 ? ((last - prev) / Math.abs(prev)) * 100 : 0;
      return { ...s, sum, avg, min, max, last, delta };
    });
  }, [series]);

  if (meterIds.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground">
        Ziehe ein Gerät hierher
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Lade Daten...</div>;
  }

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.meterId} className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {s.last.toLocaleString("de-DE", { maximumFractionDigits: 2 })} <span className="text-sm font-normal text-muted-foreground">{s.unit}</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs">
              {s.delta > 0 ? <TrendingUp className="h-3 w-3 text-emerald-500" /> : s.delta < 0 ? <TrendingDown className="h-3 w-3 text-red-500" /> : <Minus className="h-3 w-3 text-muted-foreground" />}
              <span className={s.delta > 0 ? "text-emerald-500" : s.delta < 0 ? "text-red-500" : "text-muted-foreground"}>
                {Math.abs(s.delta).toLocaleString("de-DE", { maximumFractionDigits: 1 })}%
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
              <div>Ø {s.avg.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</div>
              <div>Min {s.min.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</div>
              <div>Max {s.max.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
