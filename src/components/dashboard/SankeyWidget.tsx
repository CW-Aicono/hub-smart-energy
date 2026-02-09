import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from "recharts";
import { useLocations } from "@/hooks/useLocations";

interface SankeyWidgetProps {
  locationId: string | null;
}

// Sankey data: sources → usage categories
const SANKEY_DATA = {
  nodes: [
    { name: "Netzstrom" },        // 0
    { name: "Solar" },             // 1
    { name: "Erdgas" },            // 2
    { name: "Fernwärme" },         // 3
    { name: "Beleuchtung" },       // 4
    { name: "Klimaanlage" },       // 5
    { name: "Heizung" },           // 6
    { name: "IT & Server" },       // 7
    { name: "Warmwasser" },        // 8
    { name: "Sonstiges" },         // 9
  ],
  links: [
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
  ],
};

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-4))",
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-2))",
];

// Custom node component
function SankeyNode({ x, y, width, height, index, payload }: any) {
  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={COLORS[index % COLORS.length]}
        fillOpacity={0.9}
        rx={3}
      />
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="hsl(var(--foreground))"
        fontSize={10}
        fontWeight={500}
      >
        {payload.name}
      </text>
    </Layer>
  );
}

// Custom link component
function SankeyLink({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, index, payload }: any) {
  const sourceNode = SANKEY_DATA.nodes[payload.source];
  const sourceIndex = payload.source;

  return (
    <Layer key={`link-${index}`}>
      <path
        d={`
          M${sourceX},${sourceY}
          C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
        `}
        fill="none"
        stroke={COLORS[sourceIndex % COLORS.length]}
        strokeWidth={linkWidth}
        strokeOpacity={0.3}
      />
    </Layer>
  );
}

const SankeyWidget = ({ locationId }: SankeyWidgetProps) => {
  const { locations } = useLocations();
  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const subtitle = selectedLocation ? `Daten für: ${selectedLocation.name}` : "Alle Liegenschaften";

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg">Energiefluss (Sankey)</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={SANKEY_DATA}
            node={<SankeyNode />}
            link={<SankeyLink />}
            nodePadding={24}
            nodeWidth={12}
            margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                color: "hsl(var(--card-foreground))",
                fontSize: "12px",
              }}
            />
          </Sankey>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default SankeyWidget;
