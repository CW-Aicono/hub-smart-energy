import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMeters } from "@/hooks/useMeters";
import { useGatewayLivePower } from "@/hooks/useGatewayLivePower";
import { useRealtimePower } from "@/hooks/useRealtimePower";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";
import {
  EnergyFlowNode,
  EnergyFlowConnection,
  EnergyFlowNodeRole,
} from "@/hooks/useCustomWidgetDefinitions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
} from "recharts";
import {
  Zap,
  Home,
  Battery,
  Car,
  Fan,
  PlugZap,
  SunMedium,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

/* ── Role → icon component (rendered as SVG so we can size fluid) ── */
const ROLE_ICON: Record<EnergyFlowNodeRole, React.ComponentType<{ size?: number; className?: string }>> = {
  pv: SunMedium,
  grid: Zap,
  house: Home,
  battery: Battery,
  wallbox: Car,
  heatpump: Fan,
  consumer: PlugZap,
};

const ROLE_LABEL: Record<EnergyFlowNodeRole, string> = {
  pv: "PV-Erzeugung",
  grid: "Netz",
  house: "Verbrauch",
  battery: "Speicher",
  wallbox: "Wallbox",
  heatpump: "Wärmepumpe",
  consumer: "Verbraucher",
};

const PERIOD_SUM_LABEL: Record<TimePeriod, string> = {
  day: "Heute",
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
  all: "Gesamt",
};

function getDateRange(period: TimePeriod): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now);
  switch (period) {
    case "day": from.setHours(0, 0, 0, 0); break;
    case "week": from.setDate(from.getDate() - 7); break;
    case "month": from.setMonth(from.getMonth() - 1); break;
    case "quarter": from.setMonth(from.getMonth() - 3); break;
    case "year": from.setFullYear(from.getFullYear() - 1); break;
    case "all": from.setFullYear(from.getFullYear() - 5); break;
  }
  return { from, to: now };
}

function fmtDe(n: number, digits = 1): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPower(watts: number): string {
  const abs = Math.abs(watts);
  const sign = watts < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${fmtDe(abs / 1_000_000, 2)} MW`;
  if (abs >= 1000) return `${sign}${fmtDe(abs / 1000, 2)} kW`;
  return `${sign}${Math.round(abs).toLocaleString("de-DE")} W`;
}

function formatEnergy(kwh: number): string {
  if (kwh >= 1000) return `${fmtDe(kwh / 1000, 2)} MWh`;
  return `${fmtDe(kwh, 1)} kWh`;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

interface EnergyFlowMonitorProps {
  nodes: EnergyFlowNode[];
  connections: EnergyFlowConnection[];
}

export default function EnergyFlowMonitor({ nodes, connections }: EnergyFlowMonitorProps) {
  const { selectedPeriod } = useDashboardFilter();
  const { meters } = useMeters();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 500, h: 320 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const meterIds = useMemo(() => nodes.map((n) => n.meter_id).filter(Boolean), [nodes]);
  const relevantMeters = useMemo(
    () => (meters || []).filter((m: any) => meterIds.includes(m.id)),
    [meters, meterIds],
  );

  const { livePowerByMeter } = useGatewayLivePower(relevantMeters as any);
  const { latestByMeter } = useRealtimePower(meterIds);

  const { from, to } = useMemo(() => getDateRange(selectedPeriod), [selectedPeriod]);
  const { data: periodSums = {} } = useQuery({
    queryKey: ["energyflow-sums", meterIds, selectedPeriod],
    queryFn: async () => {
      if (!meterIds.length) return {};
      const { data } = await supabase.rpc("get_meter_daily_totals_with_fallback" as any, {
        p_meter_ids: meterIds,
        p_from_date: from.toISOString().split("T")[0],
        p_to_date: to.toISOString().split("T")[0],
      });
      if (!data) return {};
      const sums: Record<string, number> = {};
      for (const row of data) {
        sums[row.meter_id] = (sums[row.meter_id] ?? 0) + row.total_value;
      }
      return sums;
    },
    enabled: meterIds.length > 0,
    staleTime: 60_000,
  });

  const getLiveWatts = useCallback(
    (meterId: string): number | null => {
      if (latestByMeter[meterId] != null) return latestByMeter[meterId];
      const gw = livePowerByMeter[meterId];
      if (gw) {
        if (gw.unit === "kW") return gw.value * 1000;
        if (gw.unit === "MW") return gw.value * 1_000_000;
        return gw.value;
      }
      return null;
    },
    [latestByMeter, livePowerByMeter],
  );

  // Live badge: is anything reporting realtime?
  const hasLive = useMemo(
    () => meterIds.some((id) => latestByMeter[id] != null || livePowerByMeter[id] != null),
    [meterIds, latestByMeter, livePowerByMeter],
  );

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const nodeRadius = Math.min(dims.w, dims.h) * 0.09;
  const iconSize = Math.round(nodeRadius * 1.1);

  const nodePos = useCallback(
    (node: EnergyFlowNode) => ({
      x: (node.x / 100) * dims.w,
      y: (node.y / 100) * dims.h,
    }),
    [dims],
  );

  const getClippedLine = useCallback(
    (fromNode: EnergyFlowNode, toNode: EnergyFlowNode) => {
      const p1 = nodePos(fromNode);
      const p2 = nodePos(toNode);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, dist: 0, mx: p1.x, my: p1.y };
      const ux = dx / dist;
      const uy = dy / dist;
      return {
        x1: p1.x + ux * nodeRadius,
        y1: p1.y + uy * nodeRadius,
        x2: p2.x - ux * nodeRadius,
        y2: p2.y - uy * nodeRadius,
        dist: dist - 2 * nodeRadius,
        mx: (p1.x + p2.x) / 2,
        my: (p1.y + p2.y) / 2,
      };
    },
    [nodePos, nodeRadius],
  );

  const getAnimDuration = useCallback((watts: number | null): number => {
    const abs = watts != null ? Math.abs(watts) : 0;
    if (abs <= 0) return 40;
    return Math.max(2.5, 40 - Math.log10(Math.max(abs, 1)) * 11);
  }, []);

  // Autarkie/Eigenverbrauch (nur wenn passende Rollen vorhanden)
  const kpiFooter = useMemo(() => {
    const pv = nodes.find((n) => n.role === "pv");
    const grid = nodes.find((n) => n.role === "grid");
    const house = nodes.find((n) => n.role === "house");
    if (!pv || !grid || !house) return null;
    const pvW = Math.max(0, getLiveWatts(pv.meter_id) ?? 0);
    const gridW = getLiveWatts(grid.meter_id) ?? 0; // + Bezug, − Einspeisung
    const gridImport = Math.max(0, gridW);
    const gridExport = Math.max(0, -gridW);
    const houseW = Math.max(0, pvW + gridImport - gridExport);
    if (pvW + gridImport <= 0) return null;
    const autarkie = houseW > 0 ? Math.min(100, ((houseW - gridImport) / houseW) * 100) : 0;
    const eigenverbrauch = pvW > 0 ? Math.min(100, ((pvW - gridExport) / pvW) * 100) : 0;
    return { autarkie, eigenverbrauch };
  }, [nodes, getLiveWatts]);

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null;

  if (!nodes.length) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        Keine Knoten konfiguriert
      </div>
    );
  }

  return (
    <div className="relative w-full h-72">
      {/* Live-Badge */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full border bg-background/70 backdrop-blur px-2 py-0.5 text-[10px] text-muted-foreground">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            hasLive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
          }`}
        />
        {hasLive ? "Live" : "Offline"}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {connections.map((conn, i) => {
            const fromNode = nodes.find((n) => n.id === conn.from);
            const toNode = nodes.find((n) => n.id === conn.to);
            if (!fromNode || !toNode) return null;
            return (
              <linearGradient key={`grad-${i}`} id={`flow-grad-${i}`} gradientUnits="userSpaceOnUse"
                x1={nodePos(fromNode).x} y1={nodePos(fromNode).y}
                x2={nodePos(toNode).x} y2={nodePos(toNode).y}>
                <stop offset="0%" stopColor={fromNode.color} stopOpacity={0.9} />
                <stop offset="100%" stopColor={toNode.color} stopOpacity={0.9} />
              </linearGradient>
            );
          })}
        </defs>

        {/* Connections */}
        {connections.map((conn, i) => {
          const fromNode = nodes.find((n) => n.id === conn.from);
          const toNode = nodes.find((n) => n.id === conn.to);
          if (!fromNode || !toNode) return null;

          const { x1, y1, x2, y2, dist, mx, my } = getClippedLine(fromNode, toNode);
          if (dist <= 0) return null;

          const flowWatts = getLiveWatts(fromNode.meter_id);
          const hasFlow = flowWatts != null && Math.abs(flowWatts) > 0;
          const dur = getAnimDuration(flowWatts);
          const isReversed = flowWatts != null && flowWatts < 0;

          const animPath = isReversed
            ? `M${x2},${y2} L${x1},${y1}`
            : `M${x1},${y1} L${x2},${y2}`;

          // Particle count scales with power (log)
          const particleCount = hasFlow
            ? Math.min(8, Math.max(3, Math.round(Math.log10(Math.abs(flowWatts!) + 10) * 1.6)))
            : 0;
          const particleR = hasFlow
            ? Math.min(5, 2.5 + Math.log10(Math.abs(flowWatts!) + 10) * 0.5)
            : 3;

          return (
            <g key={i}>
              {/* Base line: dotted when idle, gradient stroke when active */}
              {!hasFlow ? (
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  strokeOpacity={0.2}
                  strokeDasharray="2 6"
                />
              ) : (
                <>
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={`url(#flow-grad-${i})`}
                    strokeWidth={2}
                    strokeOpacity={0.35}
                  />
                  {!reducedMotion && (
                    <line
                      x1={isReversed ? x2 : x1} y1={isReversed ? y2 : y1}
                      x2={isReversed ? x1 : x2} y2={isReversed ? y1 : y2}
                      stroke={`url(#flow-grad-${i})`}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeDasharray="8 14"
                      style={{
                        animation: `energyflow-dash ${dur}s linear infinite`,
                      }}
                    />
                  )}
                  {!reducedMotion && Array.from({ length: particleCount }).map((_, di) => (
                    <circle
                      key={di}
                      r={particleR}
                      fill={isReversed ? toNode.color : fromNode.color}
                      opacity={0.95}
                    >
                      <animateMotion
                        dur={`${dur}s`}
                        repeatCount="indefinite"
                        begin={`${(di / particleCount) * dur}s`}
                        path={animPath}
                      />
                    </circle>
                  ))}
                </>
              )}
              {/* Flow label at midpoint */}
              {hasFlow && (
                <g transform={`translate(${mx}, ${my})`}>
                  <rect
                    x={-26} y={-9}
                    width={52} height={18}
                    rx={9}
                    fill="hsl(var(--background))"
                    stroke={isReversed ? toNode.color : fromNode.color}
                    strokeOpacity={0.5}
                    strokeWidth={1}
                  />
                  <text
                    x={0} y={4}
                    textAnchor="middle"
                    className="fill-foreground text-[10px] font-semibold tabular-nums"
                  >
                    {formatPower(Math.abs(flowWatts!))}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        <style>{`
          @keyframes energyflow-dash {
            to { stroke-dashoffset: -44; }
          }
        `}</style>

        {/* Nodes */}
        {nodes.map((node) => {
          const { x: cx, y: cy } = nodePos(node);
          const liveW = getLiveWatts(node.meter_id);
          const periodSum = periodSums[node.meter_id];
          const isActive = liveW != null && Math.abs(liveW) > 0;
          const Icon = ROLE_ICON[node.role];
          const isSelected = selectedNodeId === node.id;

          return (
            <g
              key={node.id}
              className="cursor-pointer outline-none"
              tabIndex={0}
              role="button"
              aria-label={`${ROLE_LABEL[node.role]} ${node.label}${liveW != null ? `, ${formatPower(liveW)}` : ""}`}
              onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedNodeId(isSelected ? null : node.id);
                }
              }}
            >
              {/* Subtle glow ring when active */}
              {isActive && !reducedMotion && (
                <circle
                  cx={cx} cy={cy} r={nodeRadius + 4}
                  fill="none"
                  stroke={node.color}
                  strokeOpacity={0.35}
                  strokeWidth={2}
                  style={{ animation: "energyflow-pulse 2.4s ease-in-out infinite" }}
                />
              )}
              <circle
                cx={cx} cy={cy} r={nodeRadius}
                fill={node.color}
                fillOpacity={isActive ? 0.14 : 0.05}
                stroke={node.color}
                strokeOpacity={isActive ? 1 : 0.45}
                strokeWidth={isSelected ? 3.5 : 2.5}
              />
              {/* Icon centered */}
              <foreignObject
                x={cx - iconSize / 2}
                y={cy - iconSize / 2}
                width={iconSize}
                height={iconSize}
                className="pointer-events-none"
              >
                <div
                  style={{ color: node.color, width: iconSize, height: iconSize }}
                  className="flex items-center justify-center"
                >
                  <Icon size={Math.round(iconSize * 0.72)} />
                </div>
              </foreignObject>

              {/* Label under circle */}
              <text
                x={cx} y={cy + nodeRadius + 14}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-medium"
              >
                {node.label}
              </text>
              {/* Live watts */}
              {liveW != null && (
                <text
                  x={cx} y={cy + nodeRadius + 28}
                  textAnchor="middle"
                  className={`text-[10px] font-semibold tabular-nums ${
                    liveW < 0 ? "fill-emerald-500" : "fill-muted-foreground"
                  }`}
                >
                  {formatPower(liveW)}
                </text>
              )}
              {periodSum != null && periodSum !== 0 && (
                <text
                  x={cx} y={cy + nodeRadius + 40}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px] tabular-nums"
                >
                  {PERIOD_SUM_LABEL[selectedPeriod]}: {periodSum < 0 ? "−" : ""}{formatEnergy(Math.abs(periodSum))}
                </text>
              )}
            </g>
          );
        })}

        <style>{`
          @keyframes energyflow-pulse {
            0%, 100% { stroke-opacity: 0.15; transform-origin: center; }
            50% { stroke-opacity: 0.55; }
          }
        `}</style>
      </svg>

      {/* KPI footer: Autarkie / Eigenverbrauch */}
      {kpiFooter && (
        <div className="absolute left-2 bottom-1 flex items-center gap-3 rounded-md border bg-background/70 backdrop-blur px-2 py-1 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Autarkie</span>
            <span className="font-semibold tabular-nums">{fmtDe(kpiFooter.autarkie, 0)} %</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Eigenverbrauch</span>
            <span className="font-semibold tabular-nums">{fmtDe(kpiFooter.eigenverbrauch, 0)} %</span>
          </div>
        </div>
      )}

      {/* Detail-Popover als Overlay (Portal via Radix) */}
      {selectedNode && (
        <NodeDetailOverlay
          node={selectedNode}
          liveWatts={getLiveWatts(selectedNode.meter_id)}
          periodSum={periodSums[selectedNode.meter_id]}
          periodLabel={PERIOD_SUM_LABEL[selectedPeriod]}
          allNodes={nodes}
          getLiveWatts={getLiveWatts}
          anchor={{
            x: (selectedNode.x / 100) * dims.w,
            y: (selectedNode.y / 100) * dims.h,
            w: dims.w,
            h: dims.h,
          }}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Detail Overlay                                          */
/* ─────────────────────────────────────────────────────── */

interface NodeDetailOverlayProps {
  node: EnergyFlowNode;
  liveWatts: number | null;
  periodSum: number | undefined;
  periodLabel: string;
  allNodes: EnergyFlowNode[];
  getLiveWatts: (id: string) => number | null;
  anchor: { x: number; y: number; w: number; h: number };
  onClose: () => void;
}

function NodeDetailOverlay({
  node,
  liveWatts,
  periodSum,
  periodLabel,
  allNodes,
  getLiveWatts,
  anchor,
  onClose,
}: NodeDetailOverlayProps) {
  const Icon = ROLE_ICON[node.role];

  // Anteil am Fluss (heuristisch, wenn PV+house vorhanden)
  const share = useMemo(() => {
    if (node.role !== "pv") return null;
    const house = allNodes.find((n) => n.role === "house");
    if (!house) return null;
    const pvW = Math.max(0, liveWatts ?? 0);
    const houseW = Math.max(0, getLiveWatts(house.meter_id) ?? 0);
    if (houseW <= 0) return null;
    return Math.min(100, (pvW / houseW) * 100);
  }, [node, allNodes, liveWatts, getLiveWatts]);

  // Sparkline: letzte 24 h
  const { data: sparkline = [] } = useQuery({
    queryKey: ["energyflow-sparkline", node.meter_id],
    queryFn: async () => {
      if (!node.meter_id) return [];
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data } = await supabase
        .from("meter_power_readings")
        .select("recorded_at, power_value")
        .eq("meter_id", node.meter_id)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: true })
        .limit(500);
      return (data ?? []).map((r: any) => ({
        t: new Date(r.recorded_at).getTime(),
        v: Number(r.power_value) * 1000, // kW → W
      }));
    },
    enabled: !!node.meter_id,
    staleTime: 60_000,
  });

  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span
          style={{
            position: "absolute",
            left: anchor.x,
            top: anchor.y,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={16}
        className="w-72 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: `${node.color}22`, color: node.color }}
          >
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">{ROLE_LABEL[node.role]}</div>
            <div className="text-sm font-semibold truncate">{node.label}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">Aktuell</div>
            <div
              className={`text-sm font-semibold tabular-nums ${
                liveWatts != null && liveWatts < 0 ? "text-emerald-500" : ""
              }`}
            >
              {liveWatts != null ? formatPower(liveWatts) : "–"}
            </div>
          </div>
          <div className="rounded-md border p-2">
            <div className="text-muted-foreground">{periodLabel}</div>
            <div className="text-sm font-semibold tabular-nums">
              {periodSum != null ? `${periodSum < 0 ? "−" : ""}${formatEnergy(Math.abs(periodSum))}` : "–"}
            </div>
          </div>
        </div>

        {share != null && (
          <div className="text-[11px] text-muted-foreground mb-2">
            PV deckt aktuell{" "}
            <span className="font-semibold text-foreground">{fmtDe(share, 0)} %</span>{" "}
            des Verbrauchs.
          </div>
        )}

        <div className="h-20 -mx-1">
          {sparkline.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkline} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id={`spark-${node.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={node.color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={node.color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <RTooltip
                  contentStyle={{ fontSize: 11, padding: "4px 8px" }}
                  labelFormatter={(v) =>
                    new Date(v as number).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                  formatter={(v: any) => [formatPower(Number(v)), "Leistung"]}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={node.color}
                  strokeWidth={1.5}
                  fill={`url(#spark-${node.id})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground">
              Keine Daten für die letzten 24 h
            </div>
          )}
        </div>

        {node.meter_id && (
          <Button asChild variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs">
            <Link to={`/meters/${node.meter_id}`}>
              Zum Zähler-Detail
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
