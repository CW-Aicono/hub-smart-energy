import { useMemo } from "react";
import { useAnalyticsData, AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";

interface HeatmapBlockProps {
  block: AnalysisBlock;
  period: AnalyticsPeriod;
  offset: number;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
}

export function HeatmapBlock({ block, period }: HeatmapBlockProps) {
  const meterIds = (block.config.meterIds as string[]) ?? [];
  const { data: series, isLoading } = useAnalyticsData(meterIds, period, undefined, meterIds.length > 0);

  const cells = useMemo(() => {
    if (!series || series.length === 0) return [];
    const s = series[0];
    const values = s.data.map((d) => d.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return s.data.map((d) => ({
      label: d.label,
      value: d.v,
      intensity: (d.v - min) / range,
    }));
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
    <div className="h-full flex flex-col">
      <div className="text-[10px] text-muted-foreground mb-2">
        {series?.[0]?.label} ({series?.[0]?.unit})
      </div>
      <div className="flex-1 overflow-auto grid grid-cols-6 gap-1 content-start">
        {cells.map((c, i) => (
          <div
            key={i}
            className="rounded-md p-1.5 text-[9px] text-center flex flex-col justify-center min-h-[40px]"
            style={{
              backgroundColor: `rgba(59, 130, 246, ${0.1 + c.intensity * 0.8})`,
              color: c.intensity > 0.5 ? "white" : "currentColor",
            }}
            title={`${c.label}: ${c.value.toLocaleString("de-DE", { maximumFractionDigits: 2 })}`}
          >
            <span className="truncate">{c.label}</span>
            <span className="font-medium tabular-nums">{c.value.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
