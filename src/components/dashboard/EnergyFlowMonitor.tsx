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
import {
  Zap,
  Home,
  Battery,
  Car,
  Fan,
  PlugZap,
  SunMedium,
} from "lucide-react";

/* ── Role → icon mapping ── */
const ROLE_ICONS: Record<EnergyFlowNodeRole, React.ReactNode> = {
  pv: <SunMedium className="h-6 w-6" />,
  grid: <Zap className="h-6 w-6" />,
  house: <Home className="h-6 w-6" />,
  battery: <Battery className="h-6 w-6" />,
  wallbox: <Car className="h-6 w-6" />,
  heatpump: <Fan className="h-6 w-6" />,
  consumer: <PlugZap className="h-6 w-6" />,
};

/* ── Period label for sums ── */
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

function formatPower(watts: number): string {
  if (watts >= 1_000_000) return `${(watts / 1_000_000).toFixed(1)} MW`;
  if (watts >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  return `${Math.round(watts)} W`;
}

function formatEnergy(kwh: number): string {
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(1)} MWh`;
  return `${kwh.toFixed(1)} kWh`;
}

interface EnergyFlowMonitorProps {
  nodes: EnergyFlowNode[];
  connections: EnergyFlowConnection[];
}

export default function EnergyFlowMonitor({ nodes, connections }: EnergyFlowMonitorProps) {
  const { selectedPeriod } = useDashboardFilter();
  const { meters } = useMeters();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 400, h: 300 });

  // Collect all meter IDs from nodes
  const meterIds = useMemo(() => nodes.map((n) => n.meter_id).filter(Boolean), [nodes]);
  const relevantMeters = useMemo(
    () => (meters || []).filter((m: any) => meterIds.includes(m.id)),
    [meters, meterIds],
  );

  // Live power via gateway polling
  const { livePowerByMeter } = useGatewayLivePower(relevantMeters as any);
  // Realtime power via postgres changes
  const { latestByMeter } = useRealtimePower(meterIds);

  // Period sums
  const { from, to } = useMemo(() => getDateRange(selectedPeriod), [selectedPeriod]);
  const { data: periodSums = {} } = useQuery({
    queryKey: ["energyflow-sums", meterIds, selectedPeriod],
    queryFn: async () => {
      if (!meterIds.length) return {};
      const { data } = await supabase.rpc("get_meter_daily_totals", {
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

  // Resolve live watt value for a meter
  const getLiveWatts = useCallback(
    (meterId: string): number | null => {
      // Prefer realtime postgres channel
      if (latestByMeter[meterId] != null) return latestByMeter[meterId];
      // Fallback: gateway polling
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

  // Observe container size
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

  if (!nodes.length) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        Keine Knoten konfiguriert
      </div>
    );
  }

  const nodeRadius = Math.min(dims.w, dims.h) * 0.09;
  const padding = nodeRadius + 16;

  return (
    <div className="relative w-full h-72">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Connections */}
        {connections.map((conn, i) => {
          const fromNode = nodes.find((n) => n.id === conn.from);
          const toNode = nodes.find((n) => n.id === conn.to);
          if (!fromNode || !toNode) return null;
          const x1 = padding + (fromNode.x / 100) * (dims.w - 2 * padding);
          const y1 = padding + (fromNode.y / 100) * (dims.h - 2 * padding);
          const x2 = padding + (toNode.x / 100) * (dims.w - 2 * padding);
          const y2 = padding + (toNode.y / 100) * (dims.h - 2 * padding);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={fromNode.color}
              strokeWidth={2.5}
              strokeOpacity={0.5}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const cx = padding + (node.x / 100) * (dims.w - 2 * padding);
          const cy = padding + (node.y / 100) * (dims.h - 2 * padding);
          const liveW = getLiveWatts(node.meter_id);
          const periodSum = periodSums[node.meter_id];

          return (
            <g key={node.id}>
              {/* Circle */}
              <circle
                cx={cx}
                cy={cy}
                r={nodeRadius}
                fill="transparent"
                stroke={node.color}
                strokeWidth={3}
              />
              {/* Icon placeholder – rendered as foreignObject */}
              <foreignObject
                x={cx - 12}
                y={cy - (liveW != null ? 18 : 8)}
                width={24}
                height={24}
                className="pointer-events-none"
              >
                <div style={{ color: node.color }} className="flex items-center justify-center">
                  {ROLE_ICONS[node.role]}
                </div>
              </foreignObject>
              {/* Live value */}
              {liveW != null && (
                <text
                  x={cx}
                  y={cy + 12}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-semibold"
                >
                  {formatPower(liveW)}
                </text>
              )}
              {/* Label below circle */}
              <text
                x={cx}
                y={cy + nodeRadius + 14}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {node.label}
              </text>
              {/* Period sum */}
              {periodSum != null && periodSum > 0 && (
                <text
                  x={cx}
                  y={cy + nodeRadius + 26}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px]"
                >
                  {PERIOD_SUM_LABEL[selectedPeriod]}: {formatEnergy(periodSum)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
