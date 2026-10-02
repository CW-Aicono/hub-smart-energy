import { useMemo } from "react";
import { useAnalyticsData, AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid, ZAxis } from "recharts";

interface CorrelationBlockProps {
  block: AnalysisBlock;
  period: AnalyticsPeriod;
  offset: number;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
}

/**
 * Correlation scatter plot: takes exactly two devices — X = first, Y = second.
 */
export function CorrelationBlock({ block, period }: CorrelationBlockProps) {
  const meterIds = (block.config.meterIds as string[]) ?? [];
  const { data: series, isLoading } = useAnalyticsData(meterIds, period, undefined, meterIds.length >= 2);

  const { points, r, xLabel, yLabel, xUnit, yUnit } = useMemo(() => {
    if (!series || series.length < 2) return { points: [] as { x: number; y: number; label: string }[], r: 0, xLabel: "", yLabel: "", xUnit: "", yUnit: "" };
    const [sx, sy] = series;
    const yMap = new Map(sy.data.map((p) => [p.t, p.v]));
    const paired: { x: number; y: number; label: string }[] = [];
    for (const p of sx.data) {
      // find closest y bucket within ±5 min
      const y = yMap.get(p.t);
      if (Number.isFinite(y as number)) {
        paired.push({ x: p.v, y: y as number, label: p.label });
      }
    }
    // Pearson r
    let r = 0;
    if (paired.length > 2) {
      const n = paired.length;
      const mx = paired.reduce((a, p) => a + p.x, 0) / n;
      const my = paired.reduce((a, p) => a + p.y, 0) / n;
      let num = 0, dx2 = 0, dy2 = 0;
      for (const p of paired) {
        const dx = p.x - mx, dy = p.y - my;
        num += dx * dy;
        dx2 += dx * dx;
        dy2 += dy * dy;
      }
      r = dx2 && dy2 ? num / Math.sqrt(dx2 * dy2) : 0;
    }
    return { points: paired, r, xLabel: sx.label, yLabel: sy.label, xUnit: sx.unit, yUnit: sy.unit };
  }, [series]);

  if (meterIds.length < 2) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground text-center px-4">
        Ziehe zwei Geräte hierher.<br />
        <span className="text-[10px]">Erstes Gerät = X-Achse, zweites = Y-Achse</span>
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Lade Daten...</div>;
  }

  if (points.length === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Keine überlappenden Datenpunkte</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 text-[10px] text-muted-foreground">
        <span className="truncate">{xLabel} ({xUnit}) × {yLabel} ({yUnit})</span>
        <span className="tabular-nums">r = {r.toLocaleString("de-DE", { maximumFractionDigits: 3 })} · n = {points.length.toLocaleString("de-DE")}</span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis type="number" dataKey="x" name={xLabel} tick={{ fontSize: 10 }} tickFormatter={(v) => Number(v).toLocaleString("de-DE")} />
            <YAxis type="number" dataKey="y" name={yLabel} tick={{ fontSize: 10 }} width={40} tickFormatter={(v) => Number(v).toLocaleString("de-DE")} />
            <ZAxis range={[20, 20]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v: number, n: string) => [Number(v).toLocaleString("de-DE", { maximumFractionDigits: 2 }), n === "x" ? xLabel : yLabel]}
            />
            <Scatter data={points} fill="#8b5cf6" fillOpacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
