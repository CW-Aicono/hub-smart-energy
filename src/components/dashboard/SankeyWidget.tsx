import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocations } from "@/hooks/useLocations";
import { useMemo } from "react";

interface SankeyWidgetProps {
  locationId: string | null;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

const SOURCES = [
  { name: "Netzstrom", value: 4200, color: "hsl(var(--chart-1))" },
  { name: "Photovoltaik", value: 1000, color: "hsl(var(--chart-2))" },
  { name: "Erdgas", value: 2000, color: "hsl(var(--chart-3))" },
  { name: "Fernwärme", value: 1300, color: "hsl(var(--chart-5))" },
];

const TARGETS = [
  { name: "Beleuchtung", color: "hsl(var(--chart-1))" },
  { name: "Klimaanlage", color: "hsl(var(--chart-2))" },
  { name: "Heizung", color: "hsl(var(--chart-3))" },
  { name: "IT & Server", color: "hsl(var(--chart-4))" },
  { name: "Warmwasser", color: "hsl(var(--chart-5))" },
  { name: "Sonstiges", color: "hsl(var(--primary))" },
];

const LINKS: SankeyLink[] = [
  { source: 0, target: 4, value: 1800 },
  { source: 0, target: 5, value: 1200 },
  { source: 0, target: 7, value: 900 },
  { source: 0, target: 9, value: 300 },
  { source: 1, target: 4, value: 600 },
  { source: 1, target: 5, value: 400 },
  { source: 2, target: 6, value: 1500 },
  { source: 2, target: 8, value: 500 },
  { source: 3, target: 6, value: 1000 },
  { source: 3, target: 8, value: 300 },
];

const SankeyWidget = ({ locationId }: SankeyWidgetProps) => {
  const { locations } = useLocations();
  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const subtitle = selectedLocation ? `Daten für: ${selectedLocation.name}` : "Alle Liegenschaften";

  const targetValues = useMemo(() => {
    const vals: Record<number, number> = {};
    LINKS.forEach((l) => {
      vals[l.target] = (vals[l.target] || 0) + l.value;
    });
    return vals;
  }, []);

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

  const srcPositions = useMemo(() => {
    const positions: { y: number; h: number }[] = [];
    let yOff = topY;
    SOURCES.forEach((src) => {
      const h = (src.value / totalSrcVal) * availableSrcH;
      positions.push({ y: yOff, h });
      yOff += h + padding;
    });
    return positions;
  }, []);

  const totalTgtVal = Object.values(targetValues).reduce((s, v) => s + v, 0);
  const availableTgtH = totalH - (TARGETS.length - 1) * padding;

  const tgtPositions = useMemo(() => {
    const positions: { y: number; h: number }[] = [];
    let yOff = topY;
    TARGETS.forEach((_, i) => {
      const idx = i + SOURCES.length;
      const val = targetValues[idx] || 0;
      const h = (val / totalTgtVal) * availableTgtH;
      positions.push({ y: yOff, h });
      yOff += h + padding;
    });
    return positions;
  }, [targetValues]);

  // Compute link paths and label positions
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

    // Label at mid-point of the link
    const midX = (x1 + x2) / 2;
    const midYTop = (sy + ty) / 2;
    const midYBot = (sy + linkHSrc + ty + linkHTgt) / 2;
    const labelY = (midYTop + midYBot) / 2;

    return (
      <g key={`link-${i}`}>
        <path
          d={`M${x1},${sy} C${cx1},${sy} ${cx2},${ty} ${x2},${ty}
              L${x2},${ty + linkHTgt} C${cx2},${ty + linkHTgt} ${cx1},${sy + linkHSrc} ${x1},${sy + linkHSrc} Z`}
          fill={`url(#grad-${i})`}
          opacity={0.45}
          className="transition-opacity hover:opacity-75"
        />
        {link.value >= 400 && (
          <text
            x={midX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="hsl(var(--foreground))"
            fontSize={8}
            fontWeight={500}
            opacity={0.8}
          >
            {link.value.toLocaleString()} kWh
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
        <div className="w-full" style={{ aspectRatio: "2/1" }}>
          <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            <defs>
              {LINKS.map((link, i) => {
                const srcColor = SOURCES[link.source]?.color || "hsl(var(--muted))";
                const tgtIdx = link.target - SOURCES.length;
                const tgtColor = TARGETS[tgtIdx]?.color || "hsl(var(--muted))";
                return (
                  <linearGradient key={i} id={`grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={srcColor} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={tgtColor} stopOpacity={0.6} />
                  </linearGradient>
                );
              })}
            </defs>

            {/* Links with values */}
            {linkElements}

            {/* Source nodes */}
            {SOURCES.map((src, i) => {
              const pos = srcPositions[i];
              return (
                <g key={`src-${i}`}>
                  <rect x={srcX} y={pos.y} width={nodeW} height={pos.h} rx={3} fill={src.color} opacity={0.9} />
                  <text x={srcX - 6} y={pos.y + pos.h / 2 - 6} textAnchor="end" dominantBaseline="middle"
                    fill="hsl(var(--foreground))" fontSize={10} fontWeight={500}>
                    {src.name}
                  </text>
                  <text x={srcX - 6} y={pos.y + pos.h / 2 + 6} textAnchor="end" dominantBaseline="middle"
                    fill="hsl(var(--muted-foreground))" fontSize={8}>
                    {src.value.toLocaleString()} kWh
                  </text>
                </g>
              );
            })}

            {/* Target nodes */}
            {TARGETS.map((tgt, i) => {
              const idx = i + SOURCES.length;
              const val = targetValues[idx] || 0;
              const pos = tgtPositions[i];
              return (
                <g key={`tgt-${i}`}>
                  <rect x={tgtX} y={pos.y} width={nodeW} height={pos.h} rx={3} fill={tgt.color} opacity={0.9} />
                  <text x={tgtX + nodeW + 6} y={pos.y + pos.h / 2 - 6} textAnchor="start" dominantBaseline="middle"
                    fill="hsl(var(--foreground))" fontSize={10} fontWeight={500}>
                    {tgt.name}
                  </text>
                  <text x={tgtX + nodeW + 6} y={pos.y + pos.h / 2 + 6} textAnchor="start" dominantBaseline="middle"
                    fill="hsl(var(--muted-foreground))" fontSize={8}>
                    {val.toLocaleString()} kWh
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
};

export default SankeyWidget;
