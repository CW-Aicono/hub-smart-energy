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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Legend,
  Label as AxisLabel,
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
  Maximize2,
  type LucideIcon,
} from "lucide-react";

/* ── Role → icon component (rendered as SVG so we can size fluid) ── */
const ROLE_ICON: Record<EnergyFlowNodeRole, LucideIcon> = {
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

/** YYYY-MM-DD in Europe/Berlin — vermeidet den UTC-Shift von toISOString(). */
function toBerlinDateString(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
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
  const [detailNode, setDetailNode] = useState<EnergyFlowNode | null>(null);
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
        p_from_date: toBerlinDateString(from),
        p_to_date: toBerlinDateString(to),
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

  // Battery SOC per meter (for role === "battery" nodes).
  // Link: energy_storages.location_id === meters.location_id (bevorzugt gateway_device_id match).
  const batteryMeterInfo = useMemo(() => {
    const info: Array<{ meterId: string; locationId: string | null; gatewayDeviceId: string | null }> = [];
    for (const node of nodes) {
      if (node.role !== "battery" || !node.meter_id) continue;
      const m = (relevantMeters as any[]).find((x) => x.id === node.meter_id);
      if (!m) continue;
      info.push({
        meterId: node.meter_id,
        locationId: m.location_id ?? null,
        gatewayDeviceId: m.gateway_device_id ?? null,
      });
    }
    return info;
  }, [nodes, relevantMeters]);

  const batteryLocationIds = useMemo(
    () => Array.from(new Set(batteryMeterInfo.map((b) => b.locationId).filter(Boolean))) as string[],
    [batteryMeterInfo],
  );
  const batteryLocKey = batteryLocationIds.slice().sort().join(",");

  const { data: socByMeter = {} } = useQuery({
    queryKey: ["energyflow-soc", batteryLocKey, batteryMeterInfo.map((b) => b.meterId).join(",")],
    enabled: batteryLocationIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data } = await supabase
        .from("energy_storages")
        .select("id, location_id, gateway_device_id, power_meter_id, current_soc_pct")
        .in("location_id", batteryLocationIds);
      const rows = (data ?? []) as any[];
      const result: Record<string, number> = {};
      for (const b of batteryMeterInfo) {
        const match =
          rows.find((r) => r.power_meter_id && r.power_meter_id === b.meterId) ??
          rows.find((r) => r.gateway_device_id && r.gateway_device_id === b.gatewayDeviceId) ??
          rows.find((r) => r.location_id === b.locationId);
        if (match && match.current_soc_pct != null) {
          result[b.meterId] = Number(match.current_soc_pct);
        }
      }
      return result;
    },
  });


  // UUID→meter_id + tenants für Loxone-Bridge/Broadcast
  const uuidToMeterId = useMemo(() => {
    const m = new Map<string, string>();
    for (const meter of relevantMeters as any[]) {
      if (meter.sensor_uuid) m.set(String(meter.sensor_uuid).toLowerCase(), meter.id);
    }
    return m;
  }, [relevantMeters]);
  const uuids = useMemo(
    () => Array.from(uuidToMeterId.keys()),
    [uuidToMeterId],
  );
  const tenantIds = useMemo(
    () => Array.from(new Set((relevantMeters as any[]).map((m) => m.tenant_id).filter(Boolean))) as string[],
    [relevantMeters],
  );

  // Seed A: meter_power_readings (60-min Fenster – Polling-Ingest-Pfad, z. B. Shelly/Gateway)
  const meterKey = useMemo(() => meterIds.slice().sort().join(","), [meterIds]);
  const { data: seedByMeter = {} } = useQuery({
    queryKey: ["energyflow-seed", meterKey],
    enabled: meterIds.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { data } = await supabase
        .from("meter_power_readings")
        .select("meter_id, power_value, recorded_at")
        .in("meter_id", meterIds)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(2000);
      const latest: Record<string, number> = {};
      for (const row of data ?? []) {
        if (latest[row.meter_id] === undefined) {
          latest[row.meter_id] = Number(row.power_value);
        }
      }
      return latest;
    },
  });

  // Seed B: bridge_raw_samples (Loxone WS-Bridge – hier landen Live-Leistungen aus Loxone)
  const uuidKey = useMemo(() => uuids.slice().sort().join(","), [uuids]);
  const { data: bridgeByMeter = {} } = useQuery({
    queryKey: ["energyflow-bridge", uuidKey],
    enabled: uuids.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { data } = await (supabase
        .from("bridge_raw_samples" as any)
        .select("uuid, value, received_at")
        .in("uuid", uuids)
        .gte("received_at", since)
        .order("received_at", { ascending: false })
        .limit(2000));
      const latest: Record<string, number> = {};
      for (const row of ((data as any[]) ?? [])) {
        const meterId = uuidToMeterId.get(String(row.uuid).toLowerCase());
        if (!meterId) continue;
        if (latest[meterId] === undefined) {
          latest[meterId] = Number(row.value);
        }
      }
      return latest;
    },
  });

  // Realtime: Loxone broadcast (loxone-live-{tenantId}) – sub-sekündliche Updates
  const [broadcastByMeter, setBroadcastByMeter] = useState<Record<string, number>>({});
  const [broadcastSocByMeter, setBroadcastSocByMeter] = useState<Record<string, number>>({});
  const tenantKey = tenantIds.join(",");
  useEffect(() => {
    if (tenantIds.length === 0 || uuidToMeterId.size === 0) return;
    const channels = tenantIds.map((tenantId) =>
      supabase
        .channel(`loxone-live-${tenantId}`, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "readings" }, (msg: any) => {
          const events = msg?.payload?.events ?? [];
          if (!events.length) return;
          setBroadcastByMeter((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const ev of events) {
              const role = ev.role ?? "pwr";
              if (role !== "pwr") continue;
              if (!Number.isFinite(ev.value) || Math.abs(ev.value) > 10_000) continue;
              const meterId = uuidToMeterId.get(String(ev.uuid).toLowerCase());
              if (!meterId) continue;
              next[meterId] = Number(ev.value);
              changed = true;
            }
            return changed ? next : prev;
          });
          setBroadcastSocByMeter((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const ev of events) {
              const role = ev.role ?? "pwr";
              if (role !== "soc") continue;
              if (!Number.isFinite(ev.value) || ev.value < 0 || ev.value > 100) continue;
              const meterId = uuidToMeterId.get(String(ev.uuid).toLowerCase());
              if (!meterId) continue;
              next[meterId] = Number(ev.value);
              changed = true;
            }
            return changed ? next : prev;
          });
        })
        .subscribe(),
    );
    return () => { channels.forEach((c) => supabase.removeChannel(c)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey, uuidToMeterId]);

  const getLiveWatts = useCallback(
    (meterId: string): number | null => {
      // Priorität: Loxone-Broadcast → Realtime → Gateway-API → Bridge-Seed → Polling-Seed
      // (alle Seeds/Broadcast liefern kW; Realtime liefert bereits kW aus meter_power_readings.)
      if (broadcastByMeter[meterId] != null) return broadcastByMeter[meterId] * 1000;
      if (latestByMeter[meterId] != null) return latestByMeter[meterId] * 1000;
      const gw = livePowerByMeter[meterId];
      if (gw) {
        if (gw.unit === "kW") return gw.value * 1000;
        if (gw.unit === "MW") return gw.value * 1_000_000;
        return gw.value;
      }
      if (bridgeByMeter[meterId] != null) return bridgeByMeter[meterId] * 1000;
      const seed = seedByMeter[meterId];
      if (seed != null) return seed * 1000;
      return null;
    },
    [broadcastByMeter, latestByMeter, livePowerByMeter, bridgeByMeter, seedByMeter],
  );

  const getSocPct = useCallback(
    (meterId: string): number | null => broadcastSocByMeter[meterId] ?? socByMeter[meterId] ?? null,
    [broadcastSocByMeter, socByMeter],
  );

  const hasLive = useMemo(
    () => meterIds.some(
      (id) =>
        broadcastByMeter[id] != null ||
        latestByMeter[id] != null ||
        livePowerByMeter[id] != null ||
        bridgeByMeter[id] != null ||
        seedByMeter[id] != null,
    ),
    [meterIds, broadcastByMeter, latestByMeter, livePowerByMeter, bridgeByMeter, seedByMeter],
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

          const sourceColor = isReversed ? toNode.color : fromNode.color;

          return (
            <g key={i}>
              {/* Base line: always solid, colored by source when active, muted when idle */}
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={hasFlow ? sourceColor : "hsl(var(--muted-foreground))"}
                strokeWidth={hasFlow ? 2 : 1.5}
                strokeOpacity={hasFlow ? 0.55 : 0.25}
              />
              {/* Animated particles along the line */}
              {hasFlow && !reducedMotion && Array.from({ length: particleCount }).map((_, di) => (
                <circle
                  key={di}
                  r={particleR}
                  fill={sourceColor}
                  opacity={0.95}
                >
                  <animateMotion
                    dur={`${dur}s`}
                    repeatCount="indefinite"
                    begin={`-${(di / particleCount) * dur}s`}
                    path={animPath}
                  />
                </circle>
              ))}
              {/* Flow label at midpoint */}
              {hasFlow && (
                <g transform={`translate(${mx}, ${my})`}>
                  <rect
                    x={-26} y={-9}
                    width={52} height={18}
                    rx={9}
                    fill="hsl(var(--background))"
                    stroke={sourceColor}
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

          // Label side: default "bottom"; flip to "top" if any adjacent connection
          // leaves this node downward (angle in [45°, 135°]) — avoids overlap with flow.
          let labelSide: "top" | "bottom" = "bottom";
          for (const conn of connections) {
            let neighborId: string | null = null;
            if (conn.from === node.id) neighborId = conn.to;
            else if (conn.to === node.id) neighborId = conn.from;
            if (!neighborId) continue;
            const neighbor = nodes.find((n) => n.id === neighborId);
            if (!neighbor) continue;
            const np = nodePos(neighbor);
            const angleDeg = (Math.atan2(np.y - cy, np.x - cx) * 180) / Math.PI;
            if (angleDeg >= 45 && angleDeg <= 135) {
              labelSide = "top";
              break;
            }
          }
          const labelY = labelSide === "bottom" ? cy + nodeRadius + 14 : cy - nodeRadius - 22;
          const sumY   = labelSide === "bottom" ? cy + nodeRadius + 28 : cy - nodeRadius - 8;

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

              {/* Label + Periodensumme, dynamisch oben oder unten */}
              <text
                x={cx} y={labelY}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-medium"
              >
                {node.label}
              </text>
              {periodSum != null && periodSum !== 0 && node.role !== "battery" && (
                <text
                  x={cx} y={sumY}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px] tabular-nums"
                >
                  {PERIOD_SUM_LABEL[selectedPeriod]}: {periodSum < 0 ? "−" : ""}{formatEnergy(Math.abs(periodSum))}
                </text>
              )}
              {node.role === "battery" && getSocPct(node.meter_id) != null && (
                <text
                  x={cx} y={sumY}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px] tabular-nums"
                >
                  SOC: {fmtDe(getSocPct(node.meter_id) ?? 0, 0)} %
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
          socPct={getSocPct(selectedNode.meter_id)}
          allNodes={nodes}
          getLiveWatts={getLiveWatts}
          anchor={{
            x: (selectedNode.x / 100) * dims.w,
            y: (selectedNode.y / 100) * dims.h,
            w: dims.w,
            h: dims.h,
          }}
          onClose={() => setSelectedNodeId(null)}
          onOpenDetail={(n) => {
            setDetailNode(n);
            setSelectedNodeId(null);
          }}
        />
      )}

      {detailNode && (
        <MeterDetailDialog
          node={detailNode}
          socPct={getSocPct(detailNode.meter_id)}
          onClose={() => setDetailNode(null)}
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
  socPct?: number | null;
  allNodes: EnergyFlowNode[];
  getLiveWatts: (id: string) => number | null;
  anchor: { x: number; y: number; w: number; h: number };
  onClose: () => void;
  onOpenDetail: (node: EnergyFlowNode) => void;
}

function NodeDetailOverlay({
  node,
  liveWatts,
  periodSum,
  periodLabel,
  socPct,
  allNodes,
  getLiveWatts,
  anchor,
  onClose,
  onOpenDetail,
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

        {node.role === "battery" && socPct != null && (
          <div className="rounded-md border p-2 text-xs mb-3">
            <div className="text-muted-foreground">Ladezustand (SOC)</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, socPct))}%`,
                    backgroundColor: node.color,
                  }}
                />
              </div>
              <div className="text-sm font-semibold tabular-nums">{fmtDe(socPct, 0)} %</div>
            </div>
          </div>
        )}
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
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 h-7 text-xs"
            onClick={() => onOpenDetail(node)}
          >
            Zum Zähler in der Übersicht
            <Maximize2 className="ml-1 h-3 w-3" />
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Großer Detail-Dialog mit ausführlichen Graphen          */
/* ─────────────────────────────────────────────────────── */

type DetailRange = "1h" | "24h" | "7d" | "30d";

const RANGE_LABEL: Record<DetailRange, string> = {
  "1h": "1 Stunde",
  "24h": "24 Stunden",
  "7d": "7 Tage",
  "30d": "30 Tage",
};

const RANGE_MS: Record<DetailRange, number> = {
  "1h": 3600_000,
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
};

function MeterDetailDialog({
  node,
  socPct,
  onClose,
}: {
  node: EnergyFlowNode;
  socPct?: number | null;
  onClose: () => void;
}) {
  const Icon = ROLE_ICON[node.role];
  const [range, setRange] = useState<DetailRange>("24h");

  const { data: series = [], isLoading } = useQuery({
    queryKey: ["meter-detail-series", node.meter_id, range],
    queryFn: async () => {
      if (!node.meter_id) return [];
      const since = new Date(Date.now() - RANGE_MS[range]).toISOString();
      const limit = range === "30d" ? 5000 : range === "7d" ? 3000 : 1500;
      const { data } = await supabase
        .from("meter_power_readings")
        .select("recorded_at, power_value")
        .eq("meter_id", node.meter_id)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: true })
        .limit(limit);
      return (data ?? []).map((r: any) => ({
        t: new Date(r.recorded_at).getTime(),
        // kW aus der DB (power_value ist bereits kW)
        kw: Number(r.power_value),
      }));
    },
    enabled: !!node.meter_id,
    staleTime: 30_000,
  });

  const stats = useMemo(() => {
    if (!series.length) return null;
    const vals = series.map((d) => d.kw);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const bidirectional = min < -0.001 && max > 0.001;
    return { min, max, avg, bidirectional };
  }, [series]);

  // Energie pro Bucket via Trapez-Integration
  const energyBuckets = useMemo(() => {
    if (series.length < 2) return [];
    const bucketMs =
      range === "1h" ? 5 * 60_000
      : range === "24h" ? 60 * 60_000
      : range === "7d" ? 6 * 60 * 60_000
      : 24 * 60 * 60_000;
    const map = new Map<number, { import: number; export: number }>();
    for (let i = 1; i < series.length; i++) {
      const a = series[i - 1];
      const b = series[i];
      const dtH = (b.t - a.t) / 3_600_000;
      if (dtH <= 0 || dtH > 1) continue; // Lücken überspringen
      const kw = (a.kw + b.kw) / 2;
      const kwh = kw * dtH;
      const bucketKey = Math.floor(b.t / bucketMs) * bucketMs;
      const cur = map.get(bucketKey) ?? { import: 0, export: 0 };
      if (kwh >= 0) cur.import += kwh;
      else cur.export += -kwh;
      map.set(bucketKey, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ t, import: v.import, export: v.export }));
  }, [series, range]);

  const fmtTime = (t: number) => {
    const d = new Date(t);
    if (range === "1h" || range === "24h") {
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  };

  const fmtDeNum = (n: number, digits = 2) =>
    n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const totalImport = energyBuckets.reduce((s, b) => s + b.import, 0);
  const totalExport = energyBuckets.reduce((s, b) => s + b.export, 0);
  const isBattery = node.role === "battery";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `${node.color}22`, color: node.color }}
            >
              <Icon size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate">{node.label}</DialogTitle>
              <DialogDescription>
                {ROLE_LABEL[node.role]}
                {isBattery && socPct != null && (
                  <> · Ladezustand aktuell <span className="font-semibold text-foreground">{fmtDeNum(socPct, 0)} %</span></>
                )}
              </DialogDescription>
            </div>
            {isBattery && socPct != null && (
              <Badge variant="secondary" className="tabular-nums">SOC {fmtDeNum(socPct, 0)} %</Badge>
            )}
          </div>
        </DialogHeader>

        {/* Zeitraum-Umschalter */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RANGE_LABEL) as DetailRange[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === range ? "default" : "outline"}
              onClick={() => setRange(r)}
            >
              {RANGE_LABEL[r]}
            </Button>
          ))}
        </div>

        {/* KPI-Kacheln */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Ø Leistung</div>
            <div className="text-base font-semibold tabular-nums">
              {stats ? `${fmtDeNum(stats.avg)} kW` : "–"}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Max</div>
            <div className="text-base font-semibold tabular-nums">
              {stats ? `${fmtDeNum(stats.max)} kW` : "–"}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Min</div>
            <div className="text-base font-semibold tabular-nums">
              {stats ? `${fmtDeNum(stats.min)} kW` : "–"}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">
              Energie{stats?.bidirectional ? " (Bezug/Einspeisung)" : ""}
            </div>
            <div className="text-base font-semibold tabular-nums">
              {stats?.bidirectional
                ? `${fmtDeNum(totalImport)} / ${fmtDeNum(totalExport)} kWh`
                : `${fmtDeNum(totalImport - totalExport)} kWh`}
            </div>
          </div>
        </div>

        {/* Chart 1: Leistungsverlauf */}
        <div>
          <div className="text-sm font-medium mb-1">
            Leistungsverlauf · {RANGE_LABEL[range]}
          </div>
          <div className="h-[300px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Lade Daten…
              </div>
            ) : series.length < 2 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Keine Daten im gewählten Zeitraum
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 16, left: 8, bottom: 28 }}>
                  <defs>
                    <linearGradient id={`det-${node.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={node.color} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={node.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    scale="time"
                    tickFormatter={fmtTime}
                    tick={{ fontSize: 11 }}
                    height={40}
                  >
                    <AxisLabel value="Zeit" position="insideBottom" offset={-4} style={{ fontSize: 11 }} />
                  </XAxis>
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.toLocaleString("de-DE")}
                    width={70}
                  >
                    <AxisLabel value="Leistung (kW)" angle={-90} position="insideLeft" style={{ fontSize: 11, textAnchor: "middle" }} />
                  </YAxis>
                  {stats?.bidirectional && <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />}
                  <RTooltip
                    contentStyle={{ fontSize: 11 }}
                    labelFormatter={(v) =>
                      new Date(v as number).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    }
                    formatter={(v: any) => [`${fmtDeNum(Number(v))} kW`, "Leistung"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="kw"
                    stroke={node.color}
                    strokeWidth={1.8}
                    fill={`url(#det-${node.id})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Energie pro Bucket */}
        {energyBuckets.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-1">
              Energie pro {range === "1h" ? "5 Min" : range === "24h" ? "Stunde" : range === "7d" ? "6 h" : "Tag"}
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={energyBuckets} margin={{ top: 8, right: 16, left: 8, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    scale="time"
                    tickFormatter={fmtTime}
                    tick={{ fontSize: 11 }}
                    height={40}
                  >
                    <AxisLabel value="Zeit" position="insideBottom" offset={-4} style={{ fontSize: 11 }} />
                  </XAxis>
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.toLocaleString("de-DE")}
                    width={70}
                  >
                    <AxisLabel value="Energie (kWh)" angle={-90} position="insideLeft" style={{ fontSize: 11, textAnchor: "middle" }} />
                  </YAxis>
                  <RTooltip
                    contentStyle={{ fontSize: 11 }}
                    labelFormatter={(v) => new Date(v as number).toLocaleString("de-DE")}
                    formatter={(v: any, name: string) => [`${fmtDeNum(Number(v))} kWh`, name === "import" ? "Bezug" : "Einspeisung"]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "import" ? "Bezug" : "Einspeisung")} />
                  <Bar dataKey="import" stackId="e" fill={node.color} />
                  {stats?.bidirectional && (
                    <Bar dataKey="export" stackId="e" fill="hsl(152 55% 42%)" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Details-Fußzeile */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs pt-2 border-t">
          <div>
            <div className="text-muted-foreground">Rolle</div>
            <div className="font-medium">{ROLE_LABEL[node.role]}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Datenpunkte</div>
            <div className="font-medium tabular-nums">{series.length.toLocaleString("de-DE")}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Letzter Wert</div>
            <div className="font-medium">
              {series.length ? new Date(series[series.length - 1].t).toLocaleString("de-DE") : "–"}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-muted-foreground">Meter-ID</div>
            <div className="font-mono text-[10px] truncate" title={node.meter_id}>{node.meter_id || "–"}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
