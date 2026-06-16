import { useEffect, useMemo, useState } from "react";
import { Sun, Home, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useRealtimePower } from "@/hooks/useRealtimePower";

interface MeterRow {
  id: string;
  energy_type: string | null;
  is_main_meter: boolean | null;
  meter_function: string | null;
}

/**
 * Klassifikation für das Live-Band:
 *  - PV: meter_function='generation' (egal welcher energy_type)
 *  - Netz (grid): is_main_meter=true UND energy_type='strom' (Bezug positiv, Einspeisung negativ)
 *  - sonst: ignoriert (Verbrauch wird aus Energiebilanz berechnet, nicht aus Summe der Submeter)
 */
function classify(m: MeterRow): "pv" | "grid" | null {
  const t = (m.energy_type ?? "").toLowerCase();
  if (m.meter_function === "generation") return "pv";
  if (m.is_main_meter && (t === "strom" || t.includes("electric"))) return "grid";
  return null;
}

function fmtKw(w: number): string {
  const abs = Math.abs(w);
  if (abs >= 1000) return `${(w / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} kW`;
  return `${Math.round(w).toLocaleString("de-DE")} W`;
}

/**
 * Schmales Live-Band am unteren Rand des Boards.
 * Quelle: meter_power_readings — Initialwert per Query (letzte 10 Min), danach Realtime.
 */
export default function BoardEnergyBand() {
  const { tenant } = useTenant();
  const [meters, setMeters] = useState<MeterRow[]>([]);
  const [seed, setSeed] = useState<Record<string, number>>({});

  // 1) Relevante Zähler laden
  useEffect(() => {
    if (!tenant?.id) return;
    supabase
      .from("meters")
      .select("id, energy_type, is_main_meter, meter_function")
      .eq("tenant_id", tenant.id)
      .eq("is_archived", false)
      .then(({ data }) => setMeters((data ?? []) as MeterRow[]));
  }, [tenant?.id]);

  const groups = useMemo(() => {
    const g: Record<"pv" | "grid", string[]> = { pv: [], grid: [] };
    for (const m of meters) {
      const c = classify(m);
      if (c) g[c].push(m.id);
    }
    return g;
  }, [meters]);

  const meterIds = useMemo(() => [...groups.pv, ...groups.grid], [groups]);
  const meterKey = meterIds.slice().sort().join(",");

  // 2) Initialwerte seeden (letzte 10 Minuten), dann alle 60s nachziehen,
  //    damit das Band auch ohne frische Realtime-INSERTs sichtbar bleibt.
  useEffect(() => {
    if (meterIds.length === 0) {
      setSeed({});
      return;
    }
    let cancelled = false;

    const fetchSeed = async () => {
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data } = await supabase
        .from("meter_power_readings")
        .select("meter_id, power_value, recorded_at")
        .in("meter_id", meterIds)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(2000);
      if (cancelled) return;
      const latest: Record<string, number> = {};
      for (const row of data ?? []) {
        if (latest[row.meter_id] === undefined) {
          latest[row.meter_id] = Number(row.power_value);
        }
      }
      setSeed(latest);
    };

    fetchSeed();
    const id = window.setInterval(fetchSeed, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [meterKey]);

  // 3) Realtime overlay
  const { latestByMeter } = useRealtimePower(meterIds);

  const sumGroup = (ids: string[]) =>
    ids.reduce((acc, id) => acc + (latestByMeter[id] ?? seed[id] ?? 0), 0);

  const hasValue = (ids: string[]) =>
    ids.some((id) => latestByMeter[id] !== undefined || seed[id] !== undefined);

  const pvPower = Math.max(0, sumGroup(groups.pv));
  const gridPowerRaw = sumGroup(groups.grid); // + Bezug, − Einspeisung
  const gridImport = Math.max(0, gridPowerRaw);
  const gridExport = Math.max(0, -gridPowerRaw);
  // Hausverbrauch aus Energiebilanz (verlässlicher als Summe aller Submeter)
  const housePower = Math.max(0, pvPower + gridImport - gridExport);

  const hasAnyData = hasValue(groups.pv) || hasValue(groups.grid);
  if (!hasAnyData) return null;

  const flowPvToHouse = pvPower > 0 && housePower > 0;
  const flowGridToHouse = gridImport > 0;
  const flowPvToGrid = gridExport > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-4">
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--board-border))] bg-[hsl(var(--board-card))] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs uppercase tracking-wide text-[hsl(var(--board-muted))]">
            Live-Energiefluss
          </div>
          <div className="text-[10px] text-[hsl(var(--board-muted))]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            Echtzeit
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 items-center">
          <Node
            icon={<Sun className="h-5 w-5" />}
            label="PV"
            value={fmtKw(pvPower)}
            tone="positive"
            active={pvPower > 0}
          />
          <Node
            icon={<Home className="h-5 w-5" />}
            label="Verbrauch"
            value={fmtKw(housePower)}
            tone="default"
            active={housePower > 0}
            highlight
          />
          <Node
            icon={<Zap className="h-5 w-5" />}
            label={gridExport > 0 ? "Einspeisung" : "Bezug Netz"}
            value={gridExport > 0 ? fmtKw(gridExport) : fmtKw(gridImport)}
            tone={gridExport > 0 ? "positive" : "warning"}
            active={gridImport > 0 || gridExport > 0}
          />
        </div>

        <svg className="mt-3 block w-full" viewBox="0 0 600 24" preserveAspectRatio="none" height="24">
          <FlowLine x1={100} x2={300} active={flowPvToHouse} color="hsl(var(--board-success))" />
          <FlowLine x1={500} x2={300} active={flowGridToHouse} color="hsl(var(--board-accent))" />
          <FlowLine x1={300} x2={500} active={flowPvToGrid} color="hsl(var(--board-success))" />
        </svg>
      </div>
    </div>
  );
}

interface NodeProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "default" | "positive" | "warning";
  active: boolean;
  highlight?: boolean;
}

function Node({ icon, label, value, tone, active, highlight }: NodeProps) {
  const toneColor =
    tone === "positive"
      ? "text-[hsl(var(--board-success))]"
      : tone === "warning"
        ? "text-[hsl(var(--board-accent))]"
        : "text-[hsl(var(--board-foreground))]";
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
        highlight ? "bg-[hsl(var(--board-background))]/60" : ""
      }`}
    >
      <div
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border ${
          active ? "border-[hsl(var(--board-accent))]/40" : "border-[hsl(var(--board-border))]"
        } ${toneColor}`}
      >
        {icon}
        {active && (
          <span className="absolute inset-0 rounded-full border border-[hsl(var(--board-accent))]/40 animate-ping" />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--board-muted))]">{label}</div>
        <div className={`text-sm font-semibold tabular-nums truncate ${toneColor}`}>{value}</div>
      </div>
    </div>
  );
}

function FlowLine({
  x1, x2, active, color,
}: { x1: number; x2: number; active: boolean; color: string }) {
  return (
    <g>
      <line x1={x1} y1={12} x2={x2} y2={12} stroke="hsl(var(--board-border))" strokeWidth={2} />
      {active && (
        <line
          x1={x1}
          y1={12}
          x2={x2}
          y2={12}
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray="6 8"
          strokeLinecap="round"
          style={{ animation: `flow-dash 1.2s linear infinite` }}
        />
      )}
      <style>{`
        @keyframes flow-dash {
          to { stroke-dashoffset: -28; }
        }
      `}</style>
    </g>
  );
}
