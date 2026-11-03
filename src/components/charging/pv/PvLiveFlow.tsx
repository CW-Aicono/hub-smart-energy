import { useMemo, useState } from "react";
import { Sun, Zap, Building2, BatteryCharging, PlugZap } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { PvFlowData } from "@/hooks/usePvSurplusFlow";
import { deriveFlows, fmtKw, isStale, minutesSince } from "@/lib/pvFlow";
import { pvT } from "@/lib/pvFlowI18n";

const W = 640;
const H = 340;
const HUB = { x: 320, y: 170 };

interface NodeDef {
  id: string;
  x: number;
  y: number;
  label: string;
  kw: number | null;
  at: string | null;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  meter?: string;
  extra?: string;
}

function Edge({ from, to, kw, color, stale }: { from: { x: number; y: number }; to: { x: number; y: number }; kw: number; color: string; stale: boolean }) {
  const active = Math.abs(kw) >= 0.05 && !stale;
  const reverse = kw < 0;
  const width = active ? Math.min(12, 2 + Math.abs(kw) / 4) : 1.5;
  const d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const dur = Math.max(0.6, 3 - Math.min(2.4, Math.abs(kw) / 10));
  return (
    <g>
      <path d={d} stroke="hsl(var(--border))" strokeWidth={width + 2} fill="none" strokeLinecap="round" />
      <path
        d={d}
        stroke={stale ? "hsl(var(--muted-foreground))" : color}
        strokeOpacity={active ? 1 : 0.35}
        strokeWidth={width}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={active ? "6 10" : undefined}
      >
        {active && (
          <animate attributeName="stroke-dashoffset" from={reverse ? "0" : "32"} to={reverse ? "32" : "0"} dur={`${dur}s`} repeatCount="indefinite" />
        )}
      </path>
    </g>
  );
}

export default function PvLiveFlow({ data }: { data: PvFlowData }) {
  const { language } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);

  const pvKw = data.pv.length ? data.pv.reduce((a, m) => a + Math.abs(m.kw ?? 0), 0) : null;
  const pvAt = data.pv.map((m) => m.at).filter(Boolean).sort().pop() ?? null;
  const storageKw = data.storage ? (data.storage.meter?.kw ?? data.storage.setpointKw ?? null) : null;
  const storageAt = data.storage ? (data.storage.meter?.at ?? data.storage.setpointAt) : null;

  const flows = useMemo(
    () => deriveFlows({
      gridKw: data.grid?.kw ?? null,
      pvKw,
      storageKw,
      evKw: Object.fromEntries(data.ev.map((e) => [e.id, e.kw])),
    }),
    [data, pvKw, storageKw],
  );

  const evCount = Math.max(1, data.ev.length);
  const nodes: NodeDef[] = [
    { id: "pv", x: HUB.x, y: 40, label: pvT(language, "pv"), kw: data.pv.length ? pvKw : null, at: pvAt, color: "hsl(var(--pv-actual))", icon: Sun, meter: data.pv.map((m) => m.name).join(", ") },
    { id: "grid", x: 70, y: HUB.y, label: pvT(language, "grid"), kw: data.grid?.kw ?? null, at: data.grid?.at ?? null, color: "hsl(var(--energy-strom))", icon: Zap, meter: data.grid?.name },
    { id: "hub", x: HUB.x, y: HUB.y, label: pvT(language, "building"), kw: flows.buildingKw, at: data.grid?.at ?? null, color: "hsl(var(--foreground))", icon: Building2 },
  ];
  if (data.storage) {
    nodes.push({
      id: "storage", x: HUB.x, y: 300, label: pvT(language, "storage"), kw: storageKw, at: storageAt,
      color: "hsl(var(--primary))", icon: BatteryCharging, meter: data.storage.meter?.name ?? data.storage.name,
      extra: data.storage.soc != null ? `${pvT(language, "soc")}: ${Number(data.storage.soc).toLocaleString("de-DE")} %` : undefined,
    });
  }
  data.ev.forEach((e, i) => {
    nodes.push({
      id: `ev-${e.id}`, x: 570, y: evCount === 1 ? HUB.y : 60 + (i * 220) / (evCount - 1),
      label: e.name, kw: e.kw, at: e.at, color: "hsl(var(--chart-2))", icon: PlugZap, meter: e.name,
    });
  });

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const sel = selected ? byId[selected] : null;

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-[380px]" role="img" aria-label={pvT(language, "live")}>
        {data.pv.length > 0 && <Edge from={byId.pv} to={HUB} kw={flows.pvToHub} color={byId.pv.color} stale={isStale(pvAt)} />}
        <Edge from={byId.grid} to={HUB} kw={flows.gridToHub} color={byId.grid.color} stale={isStale(data.grid?.at)} />
        {data.storage && <Edge from={HUB} to={byId.storage} kw={flows.hubToStorage} color={byId.storage.color} stale={isStale(storageAt)} />}
        {data.ev.map((e) => (
          <Edge key={e.id} from={HUB} to={byId[`ev-${e.id}`]} kw={flows.hubToEv[e.id] ?? 0} color="hsl(var(--chart-2))" stale={isStale(e.at)} />
        ))}
        {nodes.map((n) => {
          const stale = n.kw === null || isStale(n.at);
          const Icon = n.icon;
          return (
            <g key={n.id} transform={`translate(${n.x}, ${n.y})`} className="cursor-pointer" onClick={() => setSelected(n.id === selected ? null : n.id)}>
              <circle r={26} fill="hsl(var(--card))" stroke={stale ? "hsl(var(--muted-foreground))" : n.color} strokeWidth={selected === n.id ? 4 : 2} strokeDasharray={stale ? "4 3" : undefined} />
              <foreignObject x={-11} y={-11} width={22} height={22} style={{ pointerEvents: "none" }}>
                <div style={{ color: stale ? "hsl(var(--muted-foreground))" : n.color }}><Icon className="h-[22px] w-[22px]" /></div>
              </foreignObject>
              <text y={42} textAnchor="middle" className="fill-foreground" fontSize={12} fontWeight={600}>{n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}</text>
              <text y={57} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
                {n.kw === null ? pvT(language, "noData") : fmtKw(n.kw)}{stale && n.kw !== null ? ` · ${pvT(language, "stale")}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      {sel ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-0.5">
          <p className="font-semibold">{sel.label}</p>
          {sel.meter && <p>{pvT(language, "meter")}: {sel.meter}</p>}
          <p>{pvT(language, "lastValue")}: {fmtKw(sel.kw, 2)} {sel.at ? `(${pvT(language, "ago", { m: minutesSince(sel.at) ?? 0 })})` : ""}</p>
          {sel.extra && <p>{sel.extra}</p>}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">{pvT(language, "clickHint")}</p>
      )}
    </div>
  );
}
