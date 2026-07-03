import { Location } from "@/hooks/useLocations";
import { ConsumptionByLocation } from "@/hooks/useLocationYearlyConsumption";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import { cn } from "@/lib/utils";

interface LocationRankingProps {
  locations: Location[];
  consumption: ConsumptionByLocation;
  energyType: string;
}

const ratingColors = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

function formatDE(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

export function LocationRanking({ locations, consumption, energyType }: LocationRankingProps) {
  const { getRating } = useBenchmarks();

  const ranked = locations
    .filter((l) => l.net_floor_area && l.net_floor_area > 0)
    .map((l) => {
      const kwh = consumption[l.id]?.[energyType] || 0;
      const specific = kwh / l.net_floor_area!;
      const rating = l.usage_type ? getRating(specific, energyType) : null;
      return { location: l, kwh, specific, rating };
    })
    .sort((a, b) => b.specific - a.specific);

  if (ranked.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Rang</TableHead>
          <TableHead>Liegenschaft</TableHead>
          <TableHead>Typ</TableHead>
          <TableHead className="text-right">NGF (m²)</TableHead>
          <TableHead className="text-right">kWh/m²a</TableHead>
          <TableHead className="text-center">Bewertung</TableHead>
          <TableHead className="text-right">Verbrauch (kWh)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ranked.map((r, i) => (
          <TableRow key={r.location.id}>
            <TableCell className="font-medium">{i + 1}</TableCell>
            <TableCell className="font-medium">{r.location.name}</TableCell>
            <TableCell className="capitalize text-muted-foreground text-sm">
              {r.location.usage_type || "–"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.location.net_floor_area?.toLocaleString("de-DE")}
            </TableCell>
            <TableCell className="text-right tabular-nums font-medium">
              {formatDE(r.specific)}
            </TableCell>
            <TableCell className="text-center">
              {r.rating ? (
                <div className={cn("inline-block h-3 w-3 rounded-full", ratingColors[r.rating])} />
              ) : "–"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.kwh > 0 ? formatDE(r.kwh) : "–"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
