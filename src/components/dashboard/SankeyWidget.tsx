import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocations } from "@/hooks/useLocations";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useMeters } from "@/hooks/useMeters";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState, useRef, useEffect } from "react";
import { formatEnergy } from "@/lib/formatEnergy";
import { supabase } from "@/integrations/supabase/client";

interface SankeyWidgetProps {
  locationId: string | null;
}

interface FlowLink {
  sourceName: string;
  sourceColor: string;
  targetName: string;
  value: number;
}

const ENERGY_COLORS: Record<string, string> = {
  strom: "hsl(var(--chart-1))",
  gas: "hsl(var(--chart-3))",
  waerme: "hsl(var(--chart-5))",
  wasser: "hsl(var(--chart-2))",
};

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
};

const TARGET_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-5))",
];

const SankeyWidget = ({ locationId }: SankeyWidgetProps) => {
  const { locations } = useLocations();
  const { readings, loading: energyLoading, hasData } = useEnergyData(locationId);
  const { meters } = useMeters();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; source: string; target: string; value: number } | null>(null);

  // Fetch floors and rooms for specific location
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

  // Compute flows
  const flows = useMemo((): FlowLink[] => {
    const flowMap: Record<string, number> = {};

    readings.forEach((r) => {
      const meter = meterMap[r.meter_id];
      if (!meter) return;
      const energyType = meter.energy_type || "strom";
      const sourceName = ENERGY_LABELS[energyType] || energyType;
      const sourceColor = ENERGY_COLORS[energyType] || ENERGY_COLORS.strom;

      let targetName: string;

      if (!locationId) {
        // All locations mode: target = location name
        const loc = locations.find((l) => l.id === meter.location_id);
        targetName = loc?.name || "Unbekannt";
      } else {
        // Specific location: target = deepest hierarchy level
        if (meter.room_id) {
          const room = rooms.find((rm) => rm.id === meter.room_id);
          targetName = room?.name || "Raum";
        } else if (meter.floor_id) {
          const floor = floors.find((f) => f.id === meter.floor_id);
          targetName = floor?.name || "Etage";
        } else {
          targetName = "Sonstige";
        }
      }

      const key = `${sourceName}|||${targetName}|||${sourceColor}`;
      flowMap[key] = (flowMap[key] || 0) + r.value;
    });

    return Object.entries(flowMap)
      .map(([key, value]) => {
        const [sourceName, targetName, sourceColor] = key.split("|||");
        return { sourceName, targetName, sourceColor, value };
      })
      .filter((f) => f.value > 0);
  }, [readings, meterMap, locationId, locations, floors, rooms]);

  // Derive unique sources and targets
  const sourceNames = useMemo(() => [...new Set(flows.map((f) => f.sourceName))], [flows]);
  const targetNames = useMemo(() => [...new Set(flows.map((f) => f.targetName))], [flows]);

  const sourceColors = useMemo(() => {
    const map: Record<string, string> = {};
    flows.forEach((f) => { map[f.sourceName] = f.sourceColor; });
    return map;
  }, [flows]);

  const loading = energyLoading;

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[200px]" /></CardContent></Card>;

  if (!hasData || flows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-lg">Energiefluss</CardTitle>
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
  const vbW = 700;
  const maxNodes = Math.max(sourceNames.length, targetNames.length);
  const nodeSlot = 48; // height per node including padding
  const vbH = Math.max(200, maxNodes * nodeSlot + 30);
  const nodeW = 14;
  const srcX = 100;
  const tgtX = vbW - 100 - nodeW;
  const padding = Math.max(4, nodeSlot * 0.15);
  const topY = 15;
  const totalH = vbH - 30;

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

  const linkElements = flows.map((flow, i) => {
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
    const cx1 = x1 + (x2 - x1) * 0.35;
    const cx2 = x1 + (x2 - x1) * 0.65;

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, source: flow.sourceName, target: flow.targetName, value: flow.value });
    };

    // Only show inline label if the link band is tall enough
    const showLabel = Math.min(linkHSrc, linkHTgt) > 14;

    return (
      <g key={`link-${i}`} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)} className="cursor-pointer">
        <path
          d={`M${x1},${sy} C${cx1},${sy} ${cx2},${ty} ${x2},${ty} L${x2},${ty + linkHTgt} C${cx2},${ty + linkHTgt} ${cx1},${sy + linkHSrc} ${x1},${sy + linkHSrc} Z`}
          fill={flow.sourceColor}
          opacity={0.4}
          className="transition-opacity hover:opacity-70"
        />
        {showLabel && (
          <text
            x={(x1 + x2) / 2}
            y={(sy + ty) / 2 + (linkHSrc + linkHTgt) / 4}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="hsl(var(--foreground))"
            fontSize={8}
            fontWeight={500}
            opacity={0.7}
            className="pointer-events-none"
          >
            {formatEnergy(flow.value)}
          </text>
        )}
      </g>
    );
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg">Energiefluss</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <div className="w-full relative" style={{ height: "220px" }}>
          <svg ref={svgRef} viewBox={`0 0 ${vbW} ${vbH}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {linkElements}

            {/* Source nodes */}
            {sourceNames.map((name, i) => {
              const pos = srcPositions[name];
              const color = sourceColors[name] || ENERGY_COLORS.strom;
              return (
                <g key={`src-${i}`}>
                  <rect x={srcX} y={pos.y} width={nodeW} height={pos.h} rx={3} fill={color} opacity={0.9} />
                  <text x={srcX - 6} y={pos.y + pos.h / 2 - 6} textAnchor="end" dominantBaseline="middle" fill="hsl(var(--foreground))" fontSize={10} fontWeight={500}>{name}</text>
                  <text x={srcX - 6} y={pos.y + pos.h / 2 + 6} textAnchor="end" dominantBaseline="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>{formatEnergy(sourceValues[name])}</text>
                </g>
              );
            })}

            {/* Target nodes */}
            {targetNames.map((name, i) => {
              const pos = tgtPositions[name];
              const color = TARGET_COLORS[i % TARGET_COLORS.length];
              const val = targetValues[name];
              return (
                <g key={`tgt-${i}`}>
                  <rect x={tgtX} y={pos.y} width={nodeW} height={pos.h} rx={3} fill={color} opacity={0.9} />
                  <text x={tgtX + nodeW + 6} y={pos.y + pos.h / 2 - 6} textAnchor="start" dominantBaseline="middle" fill="hsl(var(--foreground))" fontSize={10} fontWeight={500}>{name}</text>
                  <text x={tgtX + nodeW + 6} y={pos.y + pos.h / 2 + 6} textAnchor="start" dominantBaseline="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>{formatEnergy(val)}</text>
                </g>
              );
            })}
          </svg>
          {tooltip && (
            <div className="absolute pointer-events-none z-10 rounded-lg border bg-background px-3 py-2 text-xs shadow-lg" style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}>
              <div className="font-semibold">{tooltip.source} → {tooltip.target}</div>
              <div className="text-muted-foreground">{formatEnergy(tooltip.value)}</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SankeyWidget;
