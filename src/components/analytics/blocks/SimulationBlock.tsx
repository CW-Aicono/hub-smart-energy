import { useMemo, useState } from "react";
import { useAnalyticsData, AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Settings2, RotateCcw, TrendingUp, TrendingDown } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface SimulationParams {
  scalePct: number;      // % (100 = unchanged)
  offset: number;        // absolute offset added
  timeShiftH: number;    // hours (positive = later)
  capMax: number | null; // cap value
  floorMin: number | null;
  smoothingWindow: number; // moving avg window (points), 1 = off
}

const DEFAULTS: SimulationParams = {
  scalePct: 100,
  offset: 0,
  timeShiftH: 0,
  capMax: null,
  floorMin: null,
  smoothingWindow: 1,
};

interface Props {
  block: AnalysisBlock;
  period: AnalyticsPeriod;
  offset: number;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
}

export function SimulationBlock({ block, period, offset, onConfigChange }: Props) {
  const meterIds = (block.config.meterIds as string[]) ?? [];
  const params = { ...DEFAULTS, ...((block.config.simParams as Partial<SimulationParams>) ?? {}) };
  const { data: series, isLoading } = useAnalyticsData(
    meterIds,
    period,
    undefined,
    meterIds.length > 0,
    offset,
  );
  const [open, setOpen] = useState(false);

  const source = series?.[0];

  const { chartData, sumOrig, sumSim, unit } = useMemo(() => {
    if (!source || source.data.length === 0) {
      return { chartData: [] as any[], sumOrig: 0, sumSim: 0, unit: "" };
    }
    const shiftMs = params.timeShiftH * 3600_000;
    const scale = params.scalePct / 100;
    const raw = source.data;

    // pre-compute simulated values aligned to original time index
    const sim: number[] = raw.map((p) => {
      let v = p.v * scale + params.offset;
      if (params.capMax !== null && v > params.capMax) v = params.capMax;
      if (params.floorMin !== null && v < params.floorMin) v = params.floorMin;
      return v;
    });

    // moving average smoothing
    const w = Math.max(1, Math.floor(params.smoothingWindow));
    const smoothed = w > 1
      ? sim.map((_, i) => {
          const from = Math.max(0, i - Math.floor(w / 2));
          const to = Math.min(sim.length, i + Math.ceil(w / 2));
          let s = 0;
          for (let k = from; k < to; k++) s += sim[k];
          return s / (to - from);
        })
      : sim;

    let so = 0;
    let ss = 0;
    const data = raw.map((p, i) => {
      so += p.v;
      ss += smoothed[i];
      return {
        t: p.t + shiftMs,
        label: p.label,
        original: p.v,
        simulated: smoothed[i],
      };
    });
    return { chartData: data, sumOrig: so, sumSim: ss, unit: source.unit };
  }, [source, params.scalePct, params.offset, params.timeShiftH, params.capMax, params.floorMin, params.smoothingWindow]);

  const update = (patch: Partial<SimulationParams>) => {
    onConfigChange(block.id, { ...block.config, simParams: { ...params, ...patch } });
  };

  const reset = () => onConfigChange(block.id, { ...block.config, simParams: DEFAULTS });

  if (meterIds.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground text-center px-4">
        Ziehe ein Gerät hierher, um eine Was-wäre-wenn-Simulation zu starten
      </div>
    );
  }
  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Lade Daten...</div>;
  }
  if (!source || chartData.length === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Keine Daten im Zeitraum</div>;
  }

  const delta = sumSim - sumOrig;
  const deltaPct = sumOrig !== 0 ? (delta / sumOrig) * 100 : 0;
  const fmt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-muted-foreground truncate">
          {source.label} · Original vs. Simulation
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={reset} title="Parameter zurücksetzen">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Quick parameter row */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-muted-foreground">Skala</span>
            <span className="font-semibold">{fmt(params.scalePct)} %</span>
          </div>
          <Slider
            min={0} max={200} step={1}
            value={[params.scalePct]}
            onValueChange={(v) => update({ scalePct: v[0] })}
          />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-muted-foreground">Offset</span>
            <span className="font-semibold">{fmt(params.offset)} {unit}</span>
          </div>
          <Slider
            min={-50} max={50} step={0.5}
            value={[params.offset]}
            onValueChange={(v) => update({ offset: v[0] })}
          />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-muted-foreground">Zeitversatz</span>
            <span className="font-semibold">{params.timeShiftH > 0 ? "+" : ""}{params.timeShiftH} h</span>
          </div>
          <Slider
            min={-12} max={12} step={1}
            value={[params.timeShiftH]}
            onValueChange={(v) => update({ timeShiftH: v[0] })}
          />
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(value: number, name: string) => [
                `${fmt(value)} ${unit}`,
                name === "original" ? "Original" : "Simulation",
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="original"
              name="Original"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="simulated"
              name="Simulation"
              stroke="hsl(var(--primary))"
              strokeWidth={2.2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Delta KPI */}
      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
        <div>
          <span className="text-muted-foreground">Summe Original: </span>
          <span className="font-semibold">{fmt(sumOrig)} {unit}</span>
          <span className="text-muted-foreground mx-2">→</span>
          <span className="text-muted-foreground">Simulation: </span>
          <span className="font-semibold">{fmt(sumSim)} {unit}</span>
        </div>
        <div className={`flex items-center gap-1 font-semibold ${delta > 0 ? "text-destructive" : delta < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
          {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : delta < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
          {delta >= 0 ? "+" : ""}{fmt(delta)} {unit} ({deltaPct >= 0 ? "+" : ""}{fmt(deltaPct)} %)
        </div>
      </div>

      {/* Advanced settings */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Simulations-Parameter</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Skalierung (%)</Label>
              <Input
                type="number" step="1"
                value={params.scalePct}
                onChange={(e) => update({ scalePct: Number(e.target.value) || 0 })}
              />
              <p className="text-[10px] text-muted-foreground">z. B. 80 % simuliert eine Reduktion um 20 %.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Konstanter Offset ({unit})</Label>
              <Input
                type="number" step="0.1"
                value={params.offset}
                onChange={(e) => update({ offset: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zeitversatz (Stunden)</Label>
              <Input
                type="number" step="1"
                value={params.timeShiftH}
                onChange={(e) => update({ timeShiftH: Number(e.target.value) || 0 })}
              />
              <p className="text-[10px] text-muted-foreground">Verschiebt die Simulation zeitlich (Lastverschiebung).</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Deckelung (max)</Label>
                  <Switch
                    checked={params.capMax !== null}
                    onCheckedChange={(c) => update({ capMax: c ? Math.max(...(source.data.map((p) => p.v))) : null })}
                  />
                </div>
                <Input
                  type="number" step="0.1"
                  disabled={params.capMax === null}
                  value={params.capMax ?? ""}
                  onChange={(e) => update({ capMax: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Untergrenze (min)</Label>
                  <Switch
                    checked={params.floorMin !== null}
                    onCheckedChange={(c) => update({ floorMin: c ? 0 : null })}
                  />
                </div>
                <Input
                  type="number" step="0.1"
                  disabled={params.floorMin === null}
                  value={params.floorMin ?? ""}
                  onChange={(e) => update({ floorMin: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Glättung (Fenstergröße)</Label>
              <Input
                type="number" min={1} step="1"
                value={params.smoothingWindow}
                onChange={(e) => update({ smoothingWindow: Math.max(1, Number(e.target.value) || 1) })}
              />
              <p className="text-[10px] text-muted-foreground">Gleitender Mittelwert über N Datenpunkte (1 = aus).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reset}>Zurücksetzen</Button>
            <Button onClick={() => setOpen(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
