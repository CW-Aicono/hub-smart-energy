import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useEnergyData } from "@/hooks/useEnergyData";
import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEnergy } from "@/lib/formatEnergy";

interface ForecastWidgetProps {
  locationId: string | null;
}

const ForecastWidget = ({ locationId }: ForecastWidgetProps) => {
  const { monthlyData, loading, hasData } = useEnergyData(locationId);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[300px]" /></CardContent></Card>;

  // Find the last month with data
  const monthsWithData = monthlyData.filter((d) => d.strom + d.gas + d.waerme + d.wasser > 0);
  const currentMonthIndex = monthsWithData.length > 0
    ? monthlyData.findIndex((d) => d.month === monthsWithData[monthsWithData.length - 1].month)
    : -1;

  if (!hasData || currentMonthIndex < 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Jahresverbrauchsprognose
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            Noch keine Verbrauchsdaten für eine Prognose vorhanden
          </div>
        </CardContent>
      </Card>
    );
  }

  const actualData = monthlyData.slice(0, currentMonthIndex + 1);
  const avgTotal = actualData.reduce((s, d) => s + d.strom + d.gas + d.waerme + d.wasser, 0) / actualData.length;

  const forecastData = monthlyData.map((d, i) => {
    const actual = d.strom + d.gas + d.waerme + d.wasser;
    if (i <= currentMonthIndex) {
      return { month: d.month, ist: actual, prognose: null as number | null };
    }
    return { month: d.month, ist: null as number | null, prognose: Math.round(avgTotal) };
  });

  if (currentMonthIndex < forecastData.length - 1) {
    forecastData[currentMonthIndex].prognose = forecastData[currentMonthIndex].ist;
  }

  const totalActual = actualData.reduce((s, d) => s + d.strom + d.gas + d.waerme + d.wasser, 0);
  const totalForecast = totalActual + Math.round(avgTotal) * (12 - actualData.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Jahresverbrauchsprognose
          <HelpTooltip text="Hochrechnung des Gesamtjahresverbrauchs auf Basis der bisherigen Monatswerte. Die gestrichelte Linie zeigt die Prognose für die verbleibenden Monate." />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Hochrechnung: ~{formatEnergy(totalForecast)} Gesamtjahr
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={forecastData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                color: "hsl(var(--card-foreground))",
              }}
              formatter={(value: number | null, name: string) =>
                value !== null ? [formatEnergy(value), name === "ist" ? "Ist" : "Prognose"] : ["-", name]
              }
            />
            <Legend formatter={(value) => (value === "ist" ? "Ist-Verbrauch" : "Prognose")} />
            <Line type="monotone" dataKey="ist" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ fill: "hsl(var(--chart-1))" }} connectNulls={false} />
            <Line type="monotone" dataKey="prognose" stroke="hsl(var(--chart-3))" strokeWidth={2} strokeDasharray="8 4" dot={{ fill: "hsl(var(--chart-3))" }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default ForecastWidget;
