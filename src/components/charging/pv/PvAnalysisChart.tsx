import { useMemo } from "react";
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Scatter, ReferenceLine } from "recharts";
import { useTranslation } from "@/hooks/useTranslation";
import type { SeriesPoint } from "@/lib/pvFlow";
import { computeKpis } from "@/lib/pvFlow";
import { pvT } from "@/lib/pvFlowI18n";

const timeFmt = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const num = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 1 });

export default function PvAnalysisChart({ series, logs }: { series: SeriesPoint[]; logs: any[] }) {
  const { language } = useTranslation();
  const kpis = useMemo(() => computeKpis(series), [series]);

  const data = useMemo(() => {
    const byBucket = new Map<string, number>();
    logs.forEach((l) => {
      const d = new Date(l.executed_at);
      d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0);
      if (l.status === "success" && Number(l.allocated_w) > 0) byBucket.set(d.toISOString(), Number(l.allocated_w) / 1000);
    });
    return series.map((p) => ({
      t: p.t,
      pv: p.pvKw,
      grid: p.gridKw,
      ev: p.evKw,
      storage: p.storageKw,
      decision: byBucket.get(new Date(p.t).toISOString()) ?? null,
    }));
  }, [series, logs]);

  const kpiBox = (label: string, value: string) => (
    <div className="rounded-lg border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {kpiBox(pvT(language, "evEnergy"), `${num(kpis.evKwh)} kWh`)}
        {kpiBox(pvT(language, "pvShare"), kpis.pvShareOfEvPct === null ? "–" : `${kpis.pvShareOfEvPct.toLocaleString("de-DE")} %`)}
        {kpiBox(pvT(language, "gridDuringEv"), `${num(kpis.gridDuringEvKwh)} kWh`)}
        {kpiBox(pvT(language, "exported"), `${num(kpis.exportKwh)} kWh`)}
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="t" tickFormatter={timeFmt} fontSize={11} minTickGap={30} />
            <YAxis fontSize={11} tickFormatter={(v) => num(Number(v))} unit=" kW" width={70} />
            <Tooltip labelFormatter={(l) => timeFmt(String(l))} formatter={(v: any) => (v === null || v === undefined ? "–" : `${num(Number(v))} kW`)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Area type="monotone" dataKey="pv" name={pvT(language, "pv")} stroke="hsl(var(--pv-actual))" fill="hsl(var(--pv-actual))" fillOpacity={0.2} connectNulls />
            <Line type="monotone" dataKey="grid" name={pvT(language, "grid")} stroke="hsl(var(--energy-strom))" dot={false} connectNulls />
            <Line type="monotone" dataKey="ev" name={pvT(language, "charging")} stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="storage" name={pvT(language, "storage")} stroke="hsl(var(--primary))" strokeDasharray="4 3" dot={false} connectNulls />
            <Scatter dataKey="decision" name={pvT(language, "decision")} fill="hsl(var(--foreground))" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-muted-foreground">{pvT(language, "today")} · {pvT(language, "estimate")}</p>
    </div>
  );
}
