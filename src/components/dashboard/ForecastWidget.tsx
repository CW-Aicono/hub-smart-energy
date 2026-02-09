import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { energyConsumptionData } from "@/data/mockData";
import { TrendingUp } from "lucide-react";

interface ForecastWidgetProps {
  locationId: string | null;
}

const ForecastWidget = ({ locationId }: ForecastWidgetProps) => {
  // Use data up to current month (simulate March = index 2) for forecast
  const currentMonthIndex = 2; // March (0-based)
  const actualData = energyConsumptionData.slice(0, currentMonthIndex + 1);

  // Calculate average total consumption per month from actual data
  const avgTotal =
    actualData.reduce((sum, d) => sum + d.strom + d.gas + d.waerme, 0) /
    actualData.length;

  // Build forecast data: actual months + projected months
  const forecastData = energyConsumptionData.map((d, i) => {
    const actual = d.strom + d.gas + d.waerme;
    if (i <= currentMonthIndex) {
      return { month: d.month, ist: actual, prognose: null };
    }
    return { month: d.month, ist: null, prognose: Math.round(avgTotal) };
  });

  // Add bridge point so line connects
  if (currentMonthIndex < forecastData.length - 1) {
    forecastData[currentMonthIndex].prognose = forecastData[currentMonthIndex].ist;
  }

  const totalActual = actualData.reduce((s, d) => s + d.strom + d.gas + d.waerme, 0);
  const totalForecast = totalActual + Math.round(avgTotal) * (12 - actualData.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Jahresverbrauchsprognose
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Hochrechnung: ~{totalForecast.toLocaleString("de-DE")} kWh Gesamtjahr
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
                value !== null ? [`${value.toLocaleString("de-DE")} kWh`, name === "ist" ? "Ist" : "Prognose"] : ["-", name]
              }
            />
            <Legend formatter={(value) => (value === "ist" ? "Ist-Verbrauch" : "Prognose")} />
            <Line
              type="monotone"
              dataKey="ist"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={{ fill: "hsl(var(--chart-1))" }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="prognose"
              stroke="hsl(var(--chart-3))"
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={{ fill: "hsl(var(--chart-3))" }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default ForecastWidget;
