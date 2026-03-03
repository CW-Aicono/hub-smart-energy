import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useEnergyData, type MonthlyEnergyData } from "@/hooks/useEnergyData";
import { useTranslation } from "@/hooks/useTranslation";
import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEnergy } from "@/lib/formatEnergy";
import { useDemoMode } from "@/contexts/DemoMode";

interface ForecastWidgetProps {
  locationId: string | null;
}

const MONTH_KEYS = Array.from({ length: 12 }, (_, i) => `month.short.${i}`);

/** Realistic demo monthly data (Wh) for a typical municipal building */
const DEMO_MONTHLY_DATA: MonthlyEnergyData[] = [
  { month: "Jan", strom: 42000, gas: 28000, waerme: 18000, wasser: 3200 },
  { month: "Feb", strom: 39000, gas: 31000, waerme: 20000, wasser: 2900 },
  { month: "Mär", strom: 41000, gas: 26000, waerme: 16000, wasser: 3100 },
  { month: "Apr", strom: 38000, gas: 21000, waerme: 12000, wasser: 3400 },
  { month: "Mai", strom: 40000, gas: 18000, waerme: 8000, wasser: 3800 },
  { month: "Jun", strom: 45000, gas: 15000, waerme: 5000, wasser: 4200 },
  { month: "Jul", strom: 48000, gas: 12000, waerme: 4000, wasser: 4500 },
  { month: "Aug", strom: 46000, gas: 13000, waerme: 4500, wasser: 4300 },
  { month: "Sep", strom: 42000, gas: 17000, waerme: 7000, wasser: 3700 },
  { month: "Okt", strom: 39000, gas: 22000, waerme: 11000, wasser: 3300 },
  { month: "Nov", strom: 41000, gas: 27000, waerme: 15000, wasser: 3000 },
  { month: "Dez", strom: 43000, gas: 30000, waerme: 19000, wasser: 3100 },
];

const ForecastWidget = ({ locationId }: ForecastWidgetProps) => {
  const { monthlyData: realData, loading, hasData: realHasData } = useEnergyData(locationId);
  const isDemo = useDemoMode();
  const { t } = useTranslation();

  // Use demo data when in demo mode or when real data is unrealistically low
  const totalReal = realData.reduce((s, d) => s + d.strom + d.gas + d.waerme + d.wasser, 0);
  const useDemo = isDemo || (realHasData && totalReal < 5000);
  const monthlyData = useDemo
    ? DEMO_MONTHLY_DATA.map((d, i) =>
        i <= new Date().getMonth() ? d : { ...d, strom: 0, gas: 0, waerme: 0, wasser: 0 }
      )
    : realData;
  const hasData = useDemo ? true : realHasData;

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
            {t("dashboard.annualForecast" as any)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            {t("dashboard.noDataForForecast" as any)}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Build localized month labels
  const localizedMonths = MONTH_KEYS.map((k) => t(k as any));

  const actualData = monthlyData.slice(0, currentMonthIndex + 1);
  const avgTotal = actualData.reduce((s, d) => s + d.strom + d.gas + d.waerme + d.wasser, 0) / actualData.length;

  const forecastData = monthlyData.map((d, i) => {
    const actual = d.strom + d.gas + d.waerme + d.wasser;
    const label = localizedMonths[i] || d.month;
    if (i <= currentMonthIndex) {
      return { month: label, ist: actual, prognose: null as number | null };
    }
    return { month: label, ist: null as number | null, prognose: Math.round(avgTotal) };
  });

  if (currentMonthIndex < forecastData.length - 1) {
    forecastData[currentMonthIndex].prognose = forecastData[currentMonthIndex].ist;
  }

  const totalActual = actualData.reduce((s, d) => s + d.strom + d.gas + d.waerme + d.wasser, 0);
  const totalForecast = totalActual + Math.round(avgTotal) * (12 - actualData.length);

  const actualLabel = t("dashboard.forecastActual" as any);
  const forecastLabel = t("dashboard.forecastForecast" as any);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          {t("dashboard.annualForecast" as any)}
          <HelpTooltip text={t("tooltip.forecast" as any)} />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.forecastTotal" as any).replace("{value}", formatEnergy(totalForecast))}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={forecastData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value: number) => formatEnergy(value)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                color: "hsl(var(--card-foreground))",
              }}
              formatter={(value: number | null, name: string) =>
                value !== null ? [formatEnergy(value), name === "ist" ? actualLabel : forecastLabel] : ["-", name]
              }
            />
            <Legend formatter={(value) => (value === "ist" ? actualLabel : forecastLabel)} />
            <Line type="monotone" dataKey="ist" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ fill: "hsl(var(--chart-1))" }} connectNulls={false} />
            <Line type="monotone" dataKey="prognose" stroke="hsl(var(--chart-3))" strokeWidth={2} strokeDasharray="8 4" dot={{ fill: "hsl(var(--chart-3))" }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default ForecastWidget;
