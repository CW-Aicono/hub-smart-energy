import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocations } from "@/hooks/useLocations";
import { useMemo } from "react";

interface SankeyWidgetProps {
  locationId: string | null;
}

interface SankeyNode {
  name: string;
  value: number;
  color: string;
  x: number;
  column: number;
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

  const totalEnergy = SOURCES.reduce((s, src) => s + src.value, 0);

  const targetValues = useMemo(() => {
    const vals: Record<number, number> = {};
    LINKS.forEach((l) => {
      vals[l.target] = (vals[l.target] || 0) + l.value;
    });
    return vals;
  }, []);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg">Energiefluss</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden">
        <svg viewBox="0 0 800 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
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

          {/* Source nodes */}
          {(() => {
            const padding = 12;
            const totalH = 340;
            const totalSrcVal = SOURCES.reduce((s, v) => s + v.value, 0);
            const availableH = totalH - (SOURCES.length - 1) * padding;
            let yOff = 30;

            const srcPositions: { y: number; h: number }[] = [];

            const sourceNodes = SOURCES.map((src, i) => {
              const h = (src.value / totalSrcVal) * availableH;
              const y = yOff;
              srcPositions.push({ y, h });
              yOff += h + padding;
              return (
                <g key={`src-${i}`}>
                  <rect x={40} y={y} width={18} height={h} rx={4} fill={src.color} opacity={0.9} />
                  <text x={32} y={y + h / 2} textAnchor="end" dominantBaseline="middle"
                    fill="hsl(var(--foreground))" fontSize={11} fontWeight={500}>
                    {src.name}
                  </text>
                  <text x={32} y={y + h / 2 + 14} textAnchor="end" dominantBaseline="middle"
                    fill="hsl(var(--muted-foreground))" fontSize={9}>
                    {src.value.toLocaleString()} kWh
                  </text>
                </g>
              );
            });

            // Target nodes
            const totalTgtVal = Object.values(targetValues).reduce((s, v) => s + v, 0);
            const availableTgtH = totalH - (TARGETS.length - 1) * padding;
            let tgtYOff = 30;
            const tgtPositions: { y: number; h: number }[] = [];

            const targetNodes = TARGETS.map((tgt, i) => {
              const idx = i + SOURCES.length;
              const val = targetValues[idx] || 0;
              const h = (val / totalTgtVal) * availableTgtH;
              const y = tgtYOff;
              tgtPositions.push({ y, h });
              tgtYOff += h + padding;
              return (
                <g key={`tgt-${i}`}>
                  <rect x={742} y={y} width={18} height={h} rx={4} fill={tgt.color} opacity={0.9} />
                  <text x={768} y={y + h / 2} textAnchor="start" dominantBaseline="middle"
                    fill="hsl(var(--foreground))" fontSize={11} fontWeight={500}>
                    {tgt.name}
                  </text>
                  <text x={768} y={y + h / 2 + 14} textAnchor="start" dominantBaseline="middle"
                    fill="hsl(var(--muted-foreground))" fontSize={9}>
                    {val.toLocaleString()} kWh
                  </text>
                </g>
              );
            });

            // Links - track offsets per source/target
            const srcOffsets = SOURCES.map(() => 0);
            const tgtOffsets = TARGETS.map(() => 0);

            const links = LINKS.map((link, i) => {
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

              const x1 = 58;
              const x2 = 742;
              const cx1 = x1 + (x2 - x1) * 0.35;
              const cx2 = x1 + (x2 - x1) * 0.65;

              return (
                <path
                  key={`link-${i}`}
                  d={`M${x1},${sy} C${cx1},${sy} ${cx2},${ty} ${x2},${ty}
                      L${x2},${ty + linkHTgt} C${cx2},${ty + linkHTgt} ${cx1},${sy + linkHSrc} ${x1},${sy + linkHSrc} Z`}
                  fill={`url(#grad-${i})`}
                  opacity={0.5}
                  className="transition-opacity hover:opacity-80"
                />
              );
            });

            return (
              <>
                {links}
                {sourceNodes}
                {targetNodes}
              </>
            );
          })()}
        </svg>
      </CardContent>
    </Card>
  );
};

export default SankeyWidget;
