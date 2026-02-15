import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocations } from "@/hooks/useLocations";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useMeters } from "@/hooks/useMeters";
import { useEnergyPrices } from "@/hooks/useEnergyPrices";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState, useRef, useEffect } from "react";
import { formatEnergy, formatEnergyByType } from "@/lib/formatEnergy";
import { supabase } from "@/integrations/supabase/client";
import { ENERGY_CHART_COLORS, ENERGY_TYPE_LABELS } from "@/lib/energyTypeColors";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from "date-fns";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";

type SankeyViewMode = "leistung" | "kosten";

const PERIOD_LABELS: Record<TimePeriod, string> = {
  day: "Tag",
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
  all: "Gesamt",
};

function getPeriodStart(period: TimePeriod): Date | null {
  const now = new Date();
  switch (period) {
    case "day": return startOfDay(now);
    case "week": return startOfWeek(now, { weekStartsOn: 1 });
    case "month": return startOfMonth(now);
    case "quarter": return startOfQuarter(now);
    case "year": return startOfYear(now);
    case "all": return null;
  }
}

interface SankeyWidgetProps {
  locationId: string | null;
}

interface FlowLink {
  sourceName: string;
  sourceColor: string;
  sourceType: string;
  targetName: string;
  value: number;
}

const ENERGY_COLORS = ENERGY_CHART_COLORS;

const ENERGY_LABELS = ENERGY_TYPE_LABELS;

const TARGET_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-4))",
  ENERGY_CHART_COLORS.strom,
  ENERGY_CHART_COLORS.wasser,
  ENERGY_CHART_COLORS.gas,
  ENERGY_CHART_COLORS.waerme,
];


const SankeyWidget = ({ locationId }: SankeyWidgetProps) => {
  const { locations } = useLocations();
  const { readings, livePeriodTotals, loading: energyLoading, hasData } = useEnergyData(locationId);
  const { meters } = useMeters();
  const { prices, loading: pricesLoading } = useEnergyPrices();
  const svgRef = useRef<SVGSVGElement>(null);
  const { selectedPeriod: period, setSelectedPeriod: setPeriod } = useDashboardFilter();
  const [viewMode, setViewMode] = useState<SankeyViewMode>("leistung");

  // Build price lookup: location_id:energy_type -> price_per_unit
  const priceLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    const today = new Date().toISOString().split("T")[0];
    prices.forEach((p) => {
      if (p.valid_from <= today && (!p.valid_until || p.valid_until >= today)) {
        const key = `${p.location_id}:${p.energy_type}`;
        if (!lookup.has(key)) lookup.set(key, Number(p.price_per_unit));
      }
    });
    return lookup;
  }, [prices]);

  // Local UI state
  const [tooltip, setTooltip] = useState<{ x: number; y: number; source: string; target: string; value: number; sourceType: string } | null>(null);
  const [targetTooltip, setTargetTooltip] = useState<{ x: number; y: number; name: string; flows: { sourceName: string; sourceType: string; value: number }[] } | null>(null);
  const [floors, setFloors] = useState<{ id: string; name: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; floor_id: string; name: string }[]>([]);

  useEffect(() => {
    if (!locationId) {
      setFloors([]);
      setRooms([]);
      return;
    }
    const fetchHierarchy = async () => {
      const { data: floorData } = await supabase
        .from("floors")
        .select("id, name")
        .eq("location_id", locationId)
        .order("floor_number");
      const floorRows = (floorData ?? []) as { id: string; name: string }[];
      setFloors(floorRows);

      if (floorRows.length > 0) {
        const { data: roomData } = await supabase
          .from("floor_rooms")
          .select("id, floor_id, name")
          .in("floor_id", floorRows.map((f) => f.id))
          .order("name");
        setRooms((roomData ?? []) as { id: string; floor_id: string; name: string }[]);
      } else {
        setRooms([]);
      }
    };
    fetchHierarchy();
  }, [locationId]);

  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const subtitle = selectedLocation ? `Daten für: ${selectedLocation.name}` : "Alle Liegenschaften";

  // Build meter lookup
  const meterMap = useMemo(() => {
    const map: Record<string, { energy_type: string; location_id: string; floor_id: string | null; room_id: string | null }> = {};
    meters.forEach((m) => {
      map[m.id] = { energy_type: m.energy_type, location_id: m.location_id, floor_id: m.floor_id || null, room_id: m.room_id || null };
    });
    return map;
  }, [meters]);

  // Filter readings by selected time period
  const filteredReadings = useMemo(() => {
    const periodStart = getPeriodStart(period);
    if (!periodStart) return readings;
    return readings.filter((r) => new Date(r.reading_date) >= periodStart);
  }, [readings, period]);

  // Compute flows
  const flows = useMemo((): FlowLink[] => {
    const flowMap: Record<string, number> = {};

    const addFlow = (energyType: string, locId: string, floorId: string | null, roomId: string | null, rawValue: number) => {
      const sourceName = ENERGY_LABELS[energyType] || energyType;
      const sourceColor = ENERGY_COLORS[energyType] || ENERGY_COLORS.strom;

      let val = rawValue;
      if (viewMode === "kosten") {
        const priceKey = `${locId}:${energyType}`;
        const price = priceLookup.get(priceKey) || 0;
        val = val * price;
      }

      let targetName: string;
      if (!locationId) {
        const loc = locations.find((l) => l.id === locId);
        targetName = loc?.name || "Unbekannt";
      } else {
        if (roomId) {
          const room = rooms.find((rm) => rm.id === roomId);
          targetName = room?.name || "Raum";
        } else if (floorId) {
          const floor = floors.find((f) => f.id === floorId);
          targetName = floor?.name || "Etage";
        } else {
          targetName = "Sonstige";
        }
      }

      const key = `${sourceName}|||${targetName}|||${sourceColor}|||${energyType}`;
      flowMap[key] = (flowMap[key] || 0) + val;
    };

    // Manual meter readings
    filteredReadings.forEach((r) => {
      const meter = meterMap[r.meter_id];
      if (!meter) return;
      addFlow(meter.energy_type || "strom", meter.location_id, meter.floor_id, meter.room_id, r.value);
    });

    // Auto meter period totals
    const ptKey = period === "day" ? "totalDay" : period === "week" ? "totalWeek" : period === "month" ? "totalMonth" : period === "quarter" ? "totalMonth" : period === "year" ? "totalYear" : "totalYear";
    meters.filter(m => !m.is_archived && m.capture_type === "automatic").forEach(m => {
      if (locationId && m.location_id !== locationId) return;
      const pt = livePeriodTotals[m.id];
      if (!pt) return;
      const val = pt[ptKey as keyof typeof pt];
      if (val == null || val <= 0) return;
      addFlow(m.energy_type || "strom", m.location_id, m.floor_id || null, m.room_id || null, val);
    });

    return Object.entries(flowMap)
      .map(([key, value]) => {
        const [sourceName, targetName, sourceColor, sourceType] = key.split("|||");
        return { sourceName, targetName, sourceColor, sourceType, value };
      })
      .filter((f) => f.value > 0);
  }, [filteredReadings, meterMap, locationId, locations, floors, rooms, viewMode, priceLookup, livePeriodTotals, meters, period]);

  // Format helper based on view mode
  const formatValue = (value: number, sourceType?: string) => {
    if (viewMode === "kosten") {
      return value.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return sourceType ? formatEnergyByType(value, sourceType) : formatEnergy(value);
  };

  // Derive unique sources and targets
  const sourceNames = useMemo(() => [...new Set(flows.map((f) => f.sourceName))], [flows]);
  const targetNames = useMemo(() => [...new Set(flows.map((f) => f.targetName))], [flows]);

  const sourceColors = useMemo(() => {
    const map: Record<string, string> = {};
    flows.forEach((f) => { map[f.sourceName] = f.sourceColor; });
    return map;
  }, [flows]);

  const sourceTypes = useMemo(() => {
    const map: Record<string, string> = {};
    flows.forEach((f) => { map[f.sourceName] = f.sourceType; });
    return map;
  }, [flows]);

  const loading = energyLoading || pricesLoading;

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[200px]" /></CardContent></Card>;

  if (!hasData || flows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="font-display text-lg">Energiefluss</CardTitle>
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as SankeyViewMode)}>
                <SelectTrigger className="w-[100px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leistung">Leistung</SelectItem>
                  <SelectItem value="kosten">Kosten</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map((key) => (
                  <SelectItem key={key} value={key}>{PERIOD_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            Noch keine Verbrauchsdaten vorhanden
          </div>
        </CardContent>
      </Card>
    );
  }

  // Layout: viewBox grows with node count, container is fixed — SVG scales down
  const vbW = 900;
  const maxNodes = Math.max(sourceNames.length, targetNames.length);
  const nodeSlot = 56;
  const bottomMargin = 30; // space for label text below the last node
  const topMargin = 10;
  const vbH = Math.max(260, maxNodes * nodeSlot + bottomMargin + topMargin + 10);
  const nodeW = 14;
  const srcX = 130;
  const tgtX = vbW - 180 - nodeW;
  const padding = Math.max(4, nodeSlot * 0.15);
  const topY = topMargin;
  const totalH = vbH - topY - bottomMargin;

  // Source values
  const sourceValues: Record<string, number> = {};
  flows.forEach((f) => { sourceValues[f.sourceName] = (sourceValues[f.sourceName] || 0) + f.value; });
  const totalSrcVal = Object.values(sourceValues).reduce((s, v) => s + v, 0);

  // Target values
  const targetValues: Record<string, number> = {};
  flows.forEach((f) => { targetValues[f.targetName] = (targetValues[f.targetName] || 0) + f.value; });
  const totalTgtVal = Object.values(targetValues).reduce((s, v) => s + v, 0);

  // Source positions
  const availableSrcH = totalH - (sourceNames.length - 1) * padding;
  const srcPositions: Record<string, { y: number; h: number }> = {};
  let yOff = topY;
  sourceNames.forEach((name) => {
    const h = Math.max(12, (sourceValues[name] / totalSrcVal) * availableSrcH);
    srcPositions[name] = { y: yOff, h };
    yOff += h + padding;
  });

  // Target positions
  const availableTgtH = totalH - (targetNames.length - 1) * padding;
  const tgtPositions: Record<string, { y: number; h: number }> = {};
  let tYOff = topY;
  targetNames.forEach((name) => {
    const h = Math.max(12, (targetValues[name] / totalTgtVal) * availableTgtH);
    tgtPositions[name] = { y: tYOff, h };
    tYOff += h + padding;
  });

  // Track offsets for stacking links
  const srcOffsets: Record<string, number> = {};
  sourceNames.forEach((n) => { srcOffsets[n] = 0; });
  const tgtOffsets: Record<string, number> = {};
  targetNames.forEach((n) => { tgtOffsets[n] = 0; });

  // Collect link label info first, then resolve overlaps
  const linkData = flows.map((flow, i) => {
    const srcPos = srcPositions[flow.sourceName];
    const tgtPos = tgtPositions[flow.targetName];
    if (!srcPos || !tgtPos) return null;

    const linkHSrc = (flow.value / sourceValues[flow.sourceName]) * srcPos.h;
    const linkHTgt = (flow.value / targetValues[flow.targetName]) * tgtPos.h;

    const sy = srcPos.y + srcOffsets[flow.sourceName];
    const ty = tgtPos.y + tgtOffsets[flow.targetName];

    srcOffsets[flow.sourceName] += linkHSrc;
    tgtOffsets[flow.targetName] += linkHTgt;

    const x1 = srcX + nodeW;
    const x2 = tgtX;
    const showLabel = Math.min(linkHSrc, linkHTgt) > 14;
    const labelX = (x1 + x2) / 2;
    const labelY = (sy + ty) / 2 + (linkHSrc + linkHTgt) / 4;

    return { flow, i, sy, ty, linkHSrc, linkHTgt, x1, x2, showLabel, labelX, labelY };
  }).filter(Boolean) as { flow: FlowLink; i: number; sy: number; ty: number; linkHSrc: number; linkHTgt: number; x1: number; x2: number; showLabel: boolean; labelX: number; labelY: number }[];

  // Resolve overlapping inline labels by shifting horizontally
  const labelPositions = linkData
    .filter(d => d.showLabel)
    .sort((a, b) => a.labelY - b.labelY);

  const minYGap = 12;
  for (let i = 1; i < labelPositions.length; i++) {
    const prev = labelPositions[i - 1];
    const curr = labelPositions[i];
    if (Math.abs(curr.labelY - prev.labelY) < minYGap && Math.abs(curr.labelX - prev.labelX) < 60) {
      // Shift one left, one right
      prev.labelX -= 50;
      curr.labelX += 50;
    }
  }

  const linkElements = linkData.map((d) => {
    const { flow, i: idx, sy, ty, linkHSrc, linkHTgt, x1, x2, showLabel, labelX, labelY } = d;
    const cx1 = x1 + (x2 - x1) * 0.35;
    const cx2 = x1 + (x2 - x1) * 0.65;

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, source: flow.sourceName, target: flow.targetName, value: flow.value, sourceType: flow.sourceType });
    };

    return (
      <g key={`link-${idx}`} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)} className="cursor-pointer">
        <path
          d={`M${x1},${sy} C${cx1},${sy} ${cx2},${ty} ${x2},${ty} L${x2},${ty + linkHTgt} C${cx2},${ty + linkHTgt} ${cx1},${sy + linkHSrc} ${x1},${sy + linkHSrc} Z`}
          fill={flow.sourceColor}
          opacity={0.4}
          className="transition-opacity hover:opacity-70"
        />
        {showLabel && (
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="hsl(var(--foreground))"
            fontSize={8}
            fontWeight={500}
            opacity={0.7}
            className="pointer-events-none"
          >
            {formatValue(flow.value, flow.sourceType)}
          </text>
        )}
      </g>
    );
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="font-display text-lg">Energiefluss</CardTitle>
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as SankeyViewMode)}>
              <SelectTrigger className="w-[100px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leistung">Leistung</SelectItem>
                <SelectItem value="kosten">Kosten</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map((key) => (
                <SelectItem key={key} value={key}>{PERIOD_LABELS[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <div className="w-full relative" style={{ minHeight: 200 }}>
          <svg ref={svgRef} viewBox={`0 0 ${vbW} ${vbH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            {linkElements}

            {/* Source nodes */}
            {(() => {
              const minLabelSpacing = 30;
              const srcLabelYs: number[] = [];
              sourceNames.forEach((name) => {
                const pos = srcPositions[name];
                let labelY = pos.y + pos.h / 2;
                const lastY = srcLabelYs.length > 0 ? srcLabelYs[srcLabelYs.length - 1] : -Infinity;
                if (labelY - lastY < minLabelSpacing) labelY = lastY + minLabelSpacing;
                srcLabelYs.push(labelY);
              });
              return sourceNames.map((name, i) => {
                const pos = srcPositions[name];
                const color = sourceColors[name] || ENERGY_COLORS.strom;
                const labelY = srcLabelYs[i];
                return (
                  <g key={`src-${i}`}>
                    <rect x={srcX} y={pos.y} width={nodeW} height={pos.h} rx={3} fill={color} opacity={0.9} />
                    <text x={srcX - 6} y={labelY - 6} textAnchor="end" dominantBaseline="middle" fill="hsl(var(--foreground))" fontSize={10} fontWeight={500}>{name}</text>
                    <text x={srcX - 6} y={labelY + 6} textAnchor="end" dominantBaseline="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>{formatValue(sourceValues[name], sourceTypes[name] || "strom")}</text>
                  </g>
                );
              });
            })()}

            {/* Target nodes */}
            {(() => {
              const minLabelSpacing = 30;
              const tgtLabelYs: number[] = [];
              targetNames.forEach((name) => {
                const pos = tgtPositions[name];
                let labelY = pos.y + pos.h / 2;
                const lastY = tgtLabelYs.length > 0 ? tgtLabelYs[tgtLabelYs.length - 1] : -Infinity;
                if (labelY - lastY < minLabelSpacing) labelY = lastY + minLabelSpacing;
                tgtLabelYs.push(labelY);
              });
              return targetNames.map((name, i) => {
                const pos = tgtPositions[name];
                const color = TARGET_COLORS[i % TARGET_COLORS.length];
                const val = targetValues[name];
                const labelY = tgtLabelYs[i];
                const targetFlows = flows.filter(f => f.targetName === name).map(f => ({ sourceName: f.sourceName, sourceType: f.sourceType, value: f.value }));
                const handleTargetMouseMove = (e: React.MouseEvent) => {
                  if (!svgRef.current) return;
                  const rect = svgRef.current.getBoundingClientRect();
                  setTargetTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, name, flows: targetFlows });
                };
                return (
                  <g key={`tgt-${i}`} onMouseMove={handleTargetMouseMove} onMouseLeave={() => setTargetTooltip(null)} className="cursor-pointer">
                    <rect x={tgtX} y={pos.y} width={nodeW} height={pos.h} rx={3} fill={color} opacity={0.9} />
                    <text x={tgtX + nodeW + 6} y={labelY - 6} textAnchor="start" dominantBaseline="middle" fill="hsl(var(--foreground))" fontSize={10} fontWeight={500}>{name}</text>
                    <text x={tgtX + nodeW + 6} y={labelY + 6} textAnchor="start" dominantBaseline="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>{formatValue(val)}</text>
                  </g>
                );
              });
            })()}
          </svg>
          {tooltip && (
            <div className="absolute pointer-events-none z-10 rounded-lg border bg-background px-3 py-2 text-xs shadow-lg" style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}>
              <div className="font-semibold">{tooltip.source} → {tooltip.target}</div>
              <div className="text-muted-foreground">{formatValue(tooltip.value, tooltip.sourceType)}</div>
            </div>
          )}
          {targetTooltip && (
            <div className="absolute pointer-events-none z-10 rounded-lg border bg-background px-3 py-2 text-xs shadow-lg" style={{ left: targetTooltip.x, top: targetTooltip.y, transform: "translate(-50%, -100%)" }}>
              <div className="font-semibold mb-1">{targetTooltip.name}</div>
              {targetTooltip.flows.map((f, i) => (
                <div key={i} className="text-muted-foreground">{f.sourceName}: {formatValue(f.value, f.sourceType)}</div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SankeyWidget;
