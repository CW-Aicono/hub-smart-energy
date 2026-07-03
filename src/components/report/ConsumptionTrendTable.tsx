import { MultiYearConsumption } from "@/hooks/useLocationYearlyConsumption";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConsumptionTrendTableProps {
  locationId: string;
  consumption: MultiYearConsumption;
  years: number[];
}

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
  oel: "Heizöl",
  pellets: "Pellets",
};

function formatDE(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

export function ConsumptionTrendTable({ locationId, consumption, years }: ConsumptionTrendTableProps) {
  // Collect all energy types across years
  const energyTypes = new Set<string>();
  for (const y of years) {
    const loc = consumption[y]?.[locationId];
    if (loc) Object.keys(loc).forEach((t) => energyTypes.add(t));
  }

  if (energyTypes.size === 0) return null;

  type SortKey = "type" | "trend" | number;
  const energyRows = Array.from(energyTypes).map(eType => {
    const latestVal = consumption[latestYear]?.[locationId]?.[eType] || 0;
    const prevVal = prevYear ? (consumption[prevYear]?.[locationId]?.[eType] || 0) : 0;
    const trendPct = prevVal > 0 ? ((latestVal - prevVal) / prevVal) * 100 : 0;
    return { eType, latestVal, prevVal, trendPct };
  });

  const { sorted, sort, toggle } = useSortableData(energyRows, (r, k) => {
    if (k === "type") return ENERGY_LABELS[r.eType] || r.eType;
    if (k === "trend") return r.prevVal > 0 ? r.trendPct : -999;
    if (typeof k === "number") return consumption[k]?.[locationId]?.[r.eType] || 0;
    return null;
  });

  const sortedYears = [...years].sort((a, b) => a - b);
  const latestYear = sortedYears[sortedYears.length - 1];
  const prevYear = sortedYears.length > 1 ? sortedYears[sortedYears.length - 2] : null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead sortKey="type" current={sort} onToggle={toggle}>Energieträger</SortableHead>
          {sortedYears.map((y) => (
            <SortableHead key={y} sortKey={y} current={sort} onToggle={toggle} className="text-right">{y}</SortableHead>
          ))}
          <SortableHead sortKey="trend" current={sort} onToggle={toggle} className="text-right">Trend</SortableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => {
          const { eType, latestVal, prevVal, trendPct } = row;
          return (
            <TableRow key={eType}>
              <TableCell className="font-medium capitalize">
                {ENERGY_LABELS[eType] || eType}
              </TableCell>
              {sortedYears.map((y) => (
                <TableCell key={y} className="text-right tabular-nums">
                  {consumption[y]?.[locationId]?.[eType]
                    ? `${formatDE(consumption[y][locationId][eType])} kWh`
                    : "–"}
                </TableCell>
              ))}
              <TableCell className="text-right">
                {prevVal > 0 ? (
                  <span className={cn(
                    "inline-flex items-center gap-1 text-sm font-medium",
                    trendPct > 2 ? "text-red-600" : trendPct < -2 ? "text-emerald-600" : "text-muted-foreground"
                  )}>
                    {trendPct > 2 ? <TrendingUp className="h-4 w-4" /> :
                     trendPct < -2 ? <TrendingDown className="h-4 w-4" /> :
                     <Minus className="h-4 w-4" />}
                    {trendPct > 0 ? "+" : ""}{trendPct.toFixed(1)}%
                  </span>
                ) : "–"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
