import { useMemo } from "react";
import { useAnalyticsData, AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Op = "sub" | "add" | "mul" | "div";

interface FormulaBlockProps {
  block: AnalysisBlock;
  period: AnalyticsPeriod;
  offset: number;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
}

const OP_LABELS: Record<Op, string> = {
  sub: "A − B",
  add: "A + B",
  mul: "A × B",
  div: "A ÷ B",
};

const OP_SYMBOL: Record<Op, string> = { sub: "−", add: "+", mul: "×", div: "÷" };

function apply(op: Op, a: number, b: number): number {
  switch (op) {
    case "add": return a + b;
    case "sub": return a - b;
    case "mul": return a * b;
    case "div": return b === 0 ? 0 : a / b;
  }
}

/**
 * Formula block: virtual channel from two devices, e.g. PV − Verbrauch = Eigenverbrauch.
 */
export function FormulaBlock({ block, period, onConfigChange }: FormulaBlockProps) {
  const meterIds = (block.config.meterIds as string[]) ?? [];
  const op = (block.config.op as Op) ?? "sub";
  const { data: series, isLoading } = useAnalyticsData(meterIds, period, undefined, meterIds.length >= 2);

  const { chartData, aLabel, bLabel, unit } = useMemo(() => {
    if (!series || series.length < 2) return { chartData: [] as any[], aLabel: "", bLabel: "", unit: "" };
    const [a, b] = series;
    const bMap = new Map(b.data.map((p) => [p.t, p.v]));
    const rows = a.data
      .map((p) => {
        const bv = bMap.get(p.t);
        if (!Number.isFinite(bv as number)) return null;
        return {
          t: p.t,
          label: p.label,
          A: p.v,
          B: bv as number,
          Ergebnis: apply(op, p.v, bv as number),
        };
      })
      .filter(Boolean) as any[];
    return { chartData: rows, aLabel: a.label, bLabel: b.label, unit: a.unit };
  }, [series, op]);

  if (meterIds.length < 2) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground text-center px-4">
        Ziehe zwei Geräte (A, B) hierher.
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Lade Daten...</div>;
  }

  if (chartData.length === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Keine überlappenden Datenpunkte</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[10px] text-muted-foreground truncate">
          <span className="font-medium text-foreground">A</span> {aLabel} <span className="mx-1">{OP_SYMBOL[op]}</span>{" "}
          <span className="font-medium text-foreground">B</span> {bLabel} ({unit})
        </div>
        <Select value={op} onValueChange={(v) => onConfigChange(block.id, { ...block.config, op: v as Op })}>
          <SelectTrigger className="h-6 w-[110px] text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(OP_LABELS) as Op[]).map((k) => (
              <SelectItem key={k} value={k}>{OP_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v) => Number(v).toLocaleString("de-DE")} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(v: number) => Number(v).toLocaleString("de-DE", { maximumFractionDigits: 2 })}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="A" name={aLabel} stroke="#94a3b8" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="B" name={bLabel} stroke="#cbd5e1" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Ergebnis" stroke="#10b981" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
