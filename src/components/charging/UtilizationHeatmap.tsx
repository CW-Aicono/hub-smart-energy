import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildHeatmap, heatmapMax, type HeatmapMetric, type SessionLike } from "@/lib/charging/utilization";
import { useState } from "react";

const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const PERIODS = [
  { v: "30", label: "Letzte 30 Tage" },
  { v: "90", label: "Letzte 90 Tage" },
  { v: "365", label: "Letzte 12 Monate" },
  { v: "all", label: "Gesamt" },
];

const METRICS: { v: HeatmapMetric; label: string; unit: string }[] = [
  { v: "kwh", label: "Geladene Energie", unit: "kWh" },
  { v: "minutes", label: "Belegungsminuten", unit: "min" },
  { v: "sessions", label: "Anzahl Vorgänge", unit: "" },
];

const fmt = (v: number, unit: string) =>
  unit === ""
    ? v.toLocaleString("de-DE", { maximumFractionDigits: 0 })
    : `${v.toLocaleString("de-DE", { maximumFractionDigits: unit === "kWh" ? 1 : 0 })} ${unit}`;

interface Props {
  sessions: SessionLike[];
}

export function UtilizationHeatmap({ sessions }: Props) {
  const [metric, setMetric] = useState<HeatmapMetric>("kwh");
  const [period, setPeriod] = useState("90");

  const { matrix, max, unit } = useMemo(() => {
    let from: Date | undefined;
    if (period !== "all") {
      from = new Date(Date.now() - parseInt(period) * 86400_000);
    }
    const m = buildHeatmap(sessions, metric, from);
    const u = METRICS.find((x) => x.v === metric)!.unit;
    return { matrix: m, max: heatmapMax(m), unit: u };
  }, [sessions, metric, period]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="text-base">Auslastungs-Heatmap</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Wochentag × Uhrzeit (lokale Zeit)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={metric} onValueChange={(v) => setMetric(v as HeatmapMetric)}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={0}>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-[2px] text-[10px]">
              <thead>
                <tr>
                  <th className="w-8" />
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="w-6 text-center text-muted-foreground font-normal">
                      {h % 3 === 0 ? h : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, dow) => (
                  <tr key={dow}>
                    <td className="text-muted-foreground pr-1 text-right">{DOW[dow]}</td>
                    {row.map((v, h) => {
                      const intensity = max > 0 ? v / max : 0;
                      const bg =
                        intensity === 0
                          ? "hsl(var(--muted))"
                          : `hsl(var(--primary) / ${0.1 + intensity * 0.9})`;
                      return (
                        <td key={h}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="w-6 h-6 rounded-sm cursor-pointer"
                                style={{ backgroundColor: bg }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                {DOW[dow]} {String(h).padStart(2, "0")}:00
                              </div>
                              <div className="font-medium">{fmt(v, unit)}</div>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <span>weniger</span>
            <div className="flex gap-[2px]">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((a) => (
                <div
                  key={a}
                  className="w-4 h-3 rounded-sm"
                  style={{ backgroundColor: `hsl(var(--primary) / ${a})` }}
                />
              ))}
            </div>
            <span>mehr</span>
            <span className="ml-auto">Maximum: {fmt(max, unit)}</span>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
