import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocations } from "@/hooks/useLocations";
import { useEnergyData } from "@/hooks/useEnergyData";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState, useRef } from "react";

interface SankeyWidgetProps {
  locationId: string | null;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

const SankeyWidget = ({ locationId }: SankeyWidgetProps) => {
  const { locations } = useLocations();
  const { energyTotals, loading, hasData } = useEnergyData(locationId);
  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const subtitle = selectedLocation ? `Daten für: ${selectedLocation.name}` : "Alle Liegenschaften";
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; source: string; target: string; value: number } | null>(null);

  const SOURCES = useMemo(() => [
    { name: "Strom", value: energyTotals.strom, color: "hsl(var(--chart-1))" },
    { name: "Gas", value: energyTotals.gas, color: "hsl(var(--chart-3))" },
    { name: "Wärme", value: energyTotals.waerme, color: "hsl(var(--chart-5))" },
    { name: "Wasser", value: energyTotals.wasser, color: "hsl(var(--chart-2))" },
  ].filter((s) => s.value > 0), [energyTotals]);

  const TARGETS = useMemo(() => [
    { name: "Verbrauch", color: "hsl(var(--primary))" },
  ], []);

  // Simple: each source flows entirely to "Verbrauch"
  const LINKS: SankeyLink[] = useMemo(() =>
    SOURCES.map((_, i) => ({ source: i, target: SOURCES.length, value: SOURCES[i].value })),
  [SOURCES]);

  const targetValues = useMemo(() => {
    const vals: Record<number, number> = {};
    LINKS.forEach((l) => { vals[l.target] = (vals[l.target] || 0) + l.value; });
    return vals;
  }, [LINKS]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[200px]" /></CardContent></Card>;
  if (!hasData || SOURCES.length === 0) {
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

  const vbW = 700;
  const vbH = 340;
  const nodeW = 14;
  const srcX = 100;
  const tgtX = vbW - 100 - nodeW;
  const padding = 8;
  const topY = 10;
  const totalH = vbH - 20;

  const totalSrcVal = SOURCES.reduce((s, v) => s + v.value, 0);
  const availableSrcH = totalH - (SOURCES.length - 1) * padding;

  const srcPositions: { y: number; h: number }[] = [];
  let yOff = topY;
  SOURCES.forEach((src) => {
    const h = (src.value / totalSrcVal) * availableSrcH;
    srcPositions.push({ y: yOff, h });
    yOff += h + padding;
  });

  const totalTgtVal = Object.values(targetValues).reduce((s, v) => s + v, 0);
  const tgtPositions: { y: number; h: number }[] = [];
  let tYOff = topY;
  TARGETS.forEach((_, i) => {
    const idx = i + SOURCES.length;
    const val = targetValues[idx] || 0;
    const h = (val / totalTgtVal) * (totalH);
    tgtPositions.push({ y: tYOff, h });
    tYOff += h + padding;
  });

  const srcOffsets = SOURCES.map(() => 0);
  const tgtOffsets = TARGETS.map(() => 0);

  const linkElements = LINKS.map((link, i) => {
    const srcIdx = link.source;
    const tgtIdx = link.target - SOURCES.length;
    const srcPos = srcPositions[srcIdx];
    const tgtPos = tgtPositions[tgtIdx];
    if (!srcPos || !tgtPos) return null;

    const srcTotalVal = SOURCES[srcIdx].value;
    const tgtTotalVal = targetValues[link.target] || 1;

    const linkHSrc = (link.value / srcTotalVal) * srcPos.h;
    const linkHTgt = (link.value / tgtTotalVal) * tgtPos.h;

    const sy = srcPos.y + srcOffsets[srcIdx];
    const ty = tgtPos.y + tgtOffsets[tgtIdx];

    srcOffsets[srcIdx] += linkHSrc;
    tgtOffsets[tgtIdx] += linkHTgt;

    const x1 = srcX + nodeW;
    const x2 = tgtX;
    const cx1 = x1 + (x2 - x1) * 0.35;
    const cx2 = x1 + (x2 - x1) * 0.65;

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, source: SOURCES[srcIdx].name, target: TARGETS[tgtIdx].name, value: link.value });
    };

    return (
      <g key={`link-${i}`} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)} className="cursor-pointer">
        <path
          d={`M${x1},${sy} C${cx1},${sy} ${cx2},${ty} ${x2},${ty} L${x2},${ty + linkHTgt} C${cx2},${ty + linkHTgt} ${cx1},${sy + linkHSrc} ${x1},${sy + linkHSrc} Z`}
          fill={SOURCES[srcIdx].color}
          opacity={0.45}
          className="transition-opacity hover:opacity-75"
        />
        <text
          x={(x1 + x2) / 2}
          y={(sy + ty + linkHSrc + linkHTgt) / 4 + (sy + ty) / 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="hsl(var(--foreground))"
          fontSize={9}
          fontWeight={500}
          opacity={0.8}
          className="pointer-events-none"
        >
          {link.value.toLocaleString("de-DE")} kWh
        </text>
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
        <div className="w-full relative" style={{ aspectRatio: "2/1" }}>
          <svg ref={svgRef} viewBox={`0 0 ${vbW} ${vbH}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {linkElements}
            {SOURCES.map((src, i) => {
              const pos = srcPositions[i];
              return (
                <g key={`src-${i}`}>
                  <rect x={srcX} y={pos.y} width={nodeW} height={pos.h} rx={3} fill={src.color} opacity={0.9} />
                  <text x={srcX - 6} y={pos.y + pos.h / 2 - 6} textAnchor="end" dominantBaseline="middle" fill="hsl(var(--foreground))" fontSize={10} fontWeight={500}>{src.name}</text>
                  <text x={srcX - 6} y={pos.y + pos.h / 2 + 6} textAnchor="end" dominantBaseline="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>{src.value.toLocaleString("de-DE")} kWh</text>
                </g>
              );
            })}
            {TARGETS.map((tgt, i) => {
              const idx = i + SOURCES.length;
              const val = targetValues[idx] || 0;
              const pos = tgtPositions[i];
              return (
                <g key={`tgt-${i}`}>
                  <rect x={tgtX} y={pos.y} width={nodeW} height={pos.h} rx={3} fill={tgt.color} opacity={0.9} />
                  <text x={tgtX + nodeW + 6} y={pos.y + pos.h / 2 - 6} textAnchor="start" dominantBaseline="middle" fill="hsl(var(--foreground))" fontSize={10} fontWeight={500}>{tgt.name}</text>
                  <text x={tgtX + nodeW + 6} y={pos.y + pos.h / 2 + 6} textAnchor="start" dominantBaseline="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>{val.toLocaleString("de-DE")} kWh</text>
                </g>
              );
            })}
          </svg>
          {tooltip && (
            <div className="absolute pointer-events-none z-10 rounded-lg border bg-background px-3 py-2 text-xs shadow-lg" style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}>
              <div className="font-semibold">{tooltip.source} → {tooltip.target}</div>
              <div className="text-muted-foreground">{tooltip.value.toLocaleString("de-DE")} kWh</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SankeyWidget;
