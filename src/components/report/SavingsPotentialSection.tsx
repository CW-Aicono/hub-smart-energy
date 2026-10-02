import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, ArrowUpDown } from "lucide-react";
import { formatCurrency } from "@/lib/costCalculations";

export interface PriorityRow {
  locationId: string;
  locationName: string;
  usageType: string;
  area: number;
  energyType: "strom" | "waerme";
  specific: number;
  benchmarkAvg: number;
  excessKwhPerYear: number;
  estSavingsKwh: number;
  estSavingsEur: number;
  rating: "green" | "yellow" | "red";
  priorityScore: number;
}

interface SavingsPotentialSectionProps {
  rows: PriorityRow[];
}

export function SavingsPotentialSection({ rows }: SavingsPotentialSectionProps) {
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
          Theoretisches Potenzial bei Erreichen des Zielwerts (BMWi/BMUB 2015) – sortiert nach Dringlichkeit.
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
                  <td className="py-2 text-right">{Math.round(r.estSavingsKwh).toLocaleString("de-DE")}</td>
                  <td className="py-2 text-right">{r.estSavingsEur > 0 ? formatCurrency(r.estSavingsEur) : "–"}</td>
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
