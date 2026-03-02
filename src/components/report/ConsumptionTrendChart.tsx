import { MultiYearConsumption } from "@/hooks/useLocationYearlyConsumption";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

interface ConsumptionTrendChartProps {
  locationId: string;
  consumption: MultiYearConsumption;
  years: number[];
}

const ENERGY_COLORS: Record<string, string> = {
  strom: "#eab308",
  gas: "#f97316",
  waerme: "#ef4444",
  wasser: "#3b82f6",
  oel: "#8b5cf6",
  pellets: "#10b981",
};

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
  oel: "Heizöl",
  pellets: "Pellets",
};

export function ConsumptionTrendChart({ locationId, consumption, years }: ConsumptionTrendChartProps) {
  // Collect all energy types
  const energyTypes = new Set<string>();
  for (const y of years) {
    const loc = consumption[y]?.[locationId];
    if (loc) Object.keys(loc).forEach((t) => energyTypes.add(t));
  }

  if (energyTypes.size === 0) return null;

  const sortedYears = [...years].sort((a, b) => a - b);
  const sortedTypes = Array.from(energyTypes).sort();

  const chartData = sortedYears.map((year) => {
    const entry: Record<string, number | string> = { year: String(year) };
    for (const eType of sortedTypes) {
      entry[eType] = consumption[year]?.[locationId]?.[eType] || 0;
    }
    return entry;
  });

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="year" className="text-xs" />
          <YAxis className="text-xs" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value.toLocaleString("de-DE", { maximumFractionDigits: 0 })} kWh`,
              ENERGY_LABELS[name] || name,
            ]}
          />
          <Legend formatter={(name: string) => ENERGY_LABELS[name] || name} />
          {sortedTypes.map((eType) => (
            <Bar
              key={eType}
              dataKey={eType}
              fill={ENERGY_COLORS[eType] || "#94a3b8"}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
