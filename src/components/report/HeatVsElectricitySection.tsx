import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isHeatType } from "@/lib/report/weatherCorrection";
import type { Location } from "@/hooks/useLocations";

interface HeatVsElectricitySectionProps {
  locations: Location[];
  consumption?: Record<number, Record<string, Record<string, number>>>;
  years: number[];
}

export function HeatVsElectricitySection({
  locations,
  consumption,
  years,
}: HeatVsElectricitySectionProps) {
  const data = years.map((y) => {
    let strom = 0;
    let waerme = 0;
    for (const loc of locations) {
      const cons = consumption?.[y]?.[loc.id];
      if (!cons) continue;
      for (const [eType, kwh] of Object.entries(cons)) {
        if (eType.toLowerCase() === "strom" || eType.toLowerCase() === "electricity") {
          strom += kwh;
        } else if (isHeatType(eType)) {
          waerme += kwh;
        }
      }
    }
    return {
      year: String(y),
      Strom: Math.round(strom),
      Wärme: Math.round(waerme),
    };
  });

  const totalStrom = data.reduce((s, d) => s + d.Strom, 0);
  const totalWaerme = data.reduce((s, d) => s + d.Wärme, 0);
  const total = totalStrom + totalWaerme;

  if (total === 0) return null;

  return (
    <Card data-report-section="strom-waerme">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" /> Strom-/Wärmeverbrauch im Vergleich
        </CardTitle>
        <CardDescription>
          Anteile {Math.round((totalStrom / total) * 100)}% Strom · {Math.round((totalWaerme / total) * 100)}% Wärme
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div data-chart="strom-vs-waerme">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} unit=" kWh" />
              <Tooltip formatter={(v: number) => `${v.toLocaleString("de-DE")} kWh`} />
              <Legend />
              <Bar dataKey="Strom" stackId="a" fill="hsl(210, 80%, 55%)" />
              <Bar dataKey="Wärme" stackId="a" fill="hsl(15, 80%, 55%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
