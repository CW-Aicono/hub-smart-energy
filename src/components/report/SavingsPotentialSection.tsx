import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, ArrowUpDown } from "lucide-react";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import { isHeatType } from "@/lib/report/weatherCorrection";
import { formatCurrency, getActivePrice } from "@/lib/costCalculations";
import type { Location } from "@/hooks/useLocations";
import type { EnergyPrice } from "@/hooks/useEnergyPrices";

export interface PriorityRow {
  locationId: string;
  locationName: string;
  usageType: string;
  area: number;
  energyType: "strom" | "waerme";
  specific: number;            // kWh/m²a
  benchmarkAvg: number;        // kWh/m²a
  excessKwhPerYear: number;    // (specific - target) * area, never < 0
  estSavingsKwh: number;       // (specific - target) * area
  estSavingsEur: number;
  rating: "green" | "yellow" | "red";
  priorityScore: number;       // höher = wichtiger
}

interface SavingsPotentialSectionProps {
  locations: Location[];
  consumption?: Record<string, Record<string, number>>; // [locationId][energyType] für Berichtsjahr
  prices: EnergyPrice[];
  reportYear: number;
}

export function SavingsPotentialSection({
  locations,
  consumption,
  prices,
  reportYear,
}: SavingsPotentialSectionProps) {
  const { benchmarks } = useBenchmarks();

  const rows = useMemo<PriorityRow[]>(() => {
    if (!consumption) return [];
    const out: PriorityRow[] = [];

    for (const loc of locations) {
      if (!loc.net_floor_area || loc.net_floor_area <= 0) continue;
      const cons = consumption[loc.id];
      if (!cons) continue;

      const grouped: Record<"strom" | "waerme", number> = { strom: 0, waerme: 0 };
      for (const [eType, kwh] of Object.entries(cons)) {
        if (eType.toLowerCase() === "strom" || eType.toLowerCase() === "electricity") {
          grouped.strom += kwh;
        } else if (isHeatType(eType)) {
          grouped.waerme += kwh;
        }
      }

      for (const eType of ["strom", "waerme"] as const) {
        const kwh = grouped[eType];
        if (kwh <= 0) continue;
        const bm = benchmarks.find(
          (b) => b.usage_type === loc.usage_type && b.energy_type === eType,
        );
        if (!bm) continue;
        const specific = kwh / loc.net_floor_area;
        const rating: "green" | "yellow" | "red" =
          specific <= bm.target_value ? "green" : specific <= bm.average_value ? "yellow" : "red";
        const excess = Math.max(0, specific - bm.target_value);
        const estSavingsKwh = excess * loc.net_floor_area;

        // Preis: nimm den ersten passenden Energieträger
        let priceCandidates = ["strom"];
        if (eType === "waerme") priceCandidates = ["waerme", "gas", "fernwaerme", "oel"];
        let price = 0;
        for (const cand of priceCandidates) {
          price = getActivePrice(prices, loc.id, cand, reportYear);
          if (price > 0) break;
        }
        const estSavingsEur = estSavingsKwh * price;

        // Score: Einsparpotenzial (kWh) gewichtet × Rating
        const ratingWeight = rating === "red" ? 1.5 : rating === "yellow" ? 1.0 : 0.3;
        const priorityScore = Math.round(estSavingsKwh * ratingWeight);

        out.push({
          locationId: loc.id,
          locationName: loc.name,
          usageType: loc.usage_type || "–",
          area: loc.net_floor_area,
          energyType: eType,
          specific,
          benchmarkAvg: bm.average_value,
          excessKwhPerYear: estSavingsKwh,
          estSavingsKwh,
          estSavingsEur,
          rating,
          priorityScore,
        });
      }
    }

    return out.sort((a, b) => b.priorityScore - a.priorityScore);
  }, [locations, consumption, benchmarks, prices, reportYear]);

  const totalSavingsKwh = rows.reduce((s, r) => s + r.estSavingsKwh, 0);
  const totalSavingsEur = rows.reduce((s, r) => s + r.estSavingsEur, 0);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" /> Einsparpotenzial &amp; Priorisierung
          </CardTitle>
          <CardDescription>
            Keine Benchmarks oder keine Flächen hinterlegt – bitte Nutzungsart und NGF pflegen.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card data-report-section="einsparpotenzial">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5" /> Einsparpotenzial &amp; Priorisierungsranking
        </CardTitle>
        <CardDescription>
          Theoretisches Potenzial bei Erreichen des Zielwerts (BMWi/BMUB 2015) – sortiert nach
          Dringlichkeit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Einsparpotenzial Energie</p>
            <p className="text-2xl font-semibold text-primary">
              {Math.round(totalSavingsKwh).toLocaleString("de-DE")} kWh/a
            </p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Einsparpotenzial Kosten</p>
            <p className="text-2xl font-semibold text-primary">
              {totalSavingsEur > 0 ? formatCurrency(totalSavingsEur) : "–"}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Liegenschaft</th>
                <th className="text-left py-2">Träger</th>
                <th className="text-right py-2">kWh/m²a</th>
                <th className="text-right py-2">Ø-BM</th>
                <th className="text-right py-2">Potenzial kWh</th>
                <th className="text-right py-2">Potenzial €</th>
                <th className="text-center py-2">
                  <ArrowUpDown className="h-3 w-3 inline" /> Score
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.locationId}-${r.energyType}`} className="border-b">
                  <td className="py-2 font-mono">{idx + 1}</td>
                  <td className="py-2">{r.locationName}</td>
                  <td className="py-2 capitalize">{r.energyType}</td>
                  <td className="py-2 text-right">
                    <Badge
                      variant="outline"
                      className={
                        r.rating === "green"
                          ? "border-emerald-500 text-emerald-700"
                          : r.rating === "yellow"
                          ? "border-amber-500 text-amber-700"
                          : "border-red-500 text-red-700"
                      }
                    >
                      {r.specific.toFixed(1)}
                    </Badge>
                  </td>
                  <td className="py-2 text-right text-muted-foreground">{r.benchmarkAvg.toFixed(0)}</td>
                  <td className="py-2 text-right">
                    {Math.round(r.estSavingsKwh).toLocaleString("de-DE")}
                  </td>
                  <td className="py-2 text-right">
                    {r.estSavingsEur > 0 ? formatCurrency(r.estSavingsEur) : "–"}
                  </td>
                  <td className="py-2 text-center font-semibold">{r.priorityScore.toLocaleString("de-DE")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
