import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Coins } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, getActivePrice, calculateEnergyCost } from "@/lib/costCalculations";
import type { EnergyPrice } from "@/hooks/useEnergyPrices";
import type { Location } from "@/hooks/useLocations";

interface CostAnalysisSectionProps {
  locations: Location[];
  /** consumption[year][locationId][energyType] = kWh */
  consumption?: Record<number, Record<string, Record<string, number>>>;
  prices: EnergyPrice[];
  years: number[]; // ascending
}

const COLORS: Record<string, string> = {
  strom: "hsl(210, 80%, 55%)",
  electricity: "hsl(210, 80%, 55%)",
  waerme: "hsl(15, 80%, 55%)",
  heat: "hsl(15, 80%, 55%)",
  gas: "hsl(35, 75%, 50%)",
  fernwaerme: "hsl(0, 70%, 55%)",
  oel: "hsl(280, 50%, 50%)",
  wasser: "hsl(195, 70%, 50%)",
  water: "hsl(195, 70%, 50%)",
};
const colorFor = (e: string, i: number) =>
  COLORS[e.toLowerCase()] || `hsl(${(i * 67) % 360}, 60%, 55%)`;

export function CostAnalysisSection({
  locations,
  consumption,
  prices,
  years,
}: CostAnalysisSectionProps) {
  const latestYear = years[years.length - 1];

  // 1) Kosten pro Energieträger (latest year, alle Liegenschaften)
  const costsByEnergyType: Record<string, number> = {};
  // 2) Kosten je Jahr (gesamtsumme)
  const totalCostsByYear: Record<number, number> = {};

  for (const y of years) {
    let yearTotal = 0;
    for (const loc of locations) {
      const cons = consumption?.[y]?.[loc.id];
      if (!cons) continue;
      for (const [eType, kwh] of Object.entries(cons)) {
        const price = getActivePrice(prices, loc.id, eType, y);
        if (price <= 0) continue;
        const cost = calculateEnergyCost(kwh, price);
        yearTotal += cost;
        if (y === latestYear) {
          costsByEnergyType[eType] = (costsByEnergyType[eType] || 0) + cost;
        }
      }
    }
    totalCostsByYear[y] = yearTotal;
  }

  const pieData = Object.entries(costsByEnergyType)
    .filter(([, v]) => v > 0)
    .map(([eType, cost]) => ({ name: eType, value: Math.round(cost) }));

  const barData = years.map((y) => ({
    year: String(y),
    Kosten: Math.round(totalCostsByYear[y] || 0),
  }));

  const totalLatest = pieData.reduce((s, x) => s + x.value, 0);

  if (pieData.length === 0 && barData.every((b) => b.Kosten === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" /> Kostenanalyse
          </CardTitle>
          <CardDescription>
            Keine Energiepreise hinterlegt – bitte unter „Energiepreise" konfigurieren.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card data-report-section="kostenanalyse">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5" /> Kostenanalyse
        </CardTitle>
        <CardDescription>
          Aufteilung der Energiekosten {latestYear} und Mehrjahresentwicklung
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div data-chart="cost-pie">
            <h4 className="text-sm font-medium mb-2">
              Kostenverteilung {latestYear} – Gesamt: {formatCurrency(totalLatest)}
            </h4>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label={(e: any) => `${e.name}: ${Math.round((e.value / totalLatest) * 100)}%`}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={entry.name} fill={colorFor(entry.name, i)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div data-chart="cost-bar">
            <h4 className="text-sm font-medium mb-2">Kostenentwicklung</h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k €`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="Kosten" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Energieträger</th>
                <th className="text-right py-2">Kosten {latestYear}</th>
                <th className="text-right py-2">Anteil</th>
              </tr>
            </thead>
            <tbody>
              {pieData
                .sort((a, b) => b.value - a.value)
                .map((p) => (
                  <tr key={p.name} className="border-b">
                    <td className="py-2 capitalize">{p.name}</td>
                    <td className="py-2 text-right">{formatCurrency(p.value)}</td>
                    <td className="py-2 text-right">
                      {totalLatest > 0 ? Math.round((p.value / totalLatest) * 100) : 0}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
