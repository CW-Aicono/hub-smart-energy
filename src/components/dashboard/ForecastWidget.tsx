import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useMonthlyConsumptionByType } from "@/hooks/useMonthlyConsumptionByType";
import { useTranslation } from "@/hooks/useTranslation";
import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEnergy } from "@/lib/formatEnergy";
import { useDemoMode } from "@/contexts/DemoMode";

interface ForecastWidgetProps {
  locationId: string | null;
}

const MONTH_KEYS = Array.from({ length: 12 }, (_, i) => `month.short.${i}`);

/** Realistic demo monthly data (Wh) for a typical municipal building, per energy type */
const DEMO_BY_TYPE: Record<string, number[]> = {
  strom: [42000, 39000, 41000, 38000, 40000, 45000, 48000, 46000, 42000, 39000, 41000, 43000],
  gas: [28000, 31000, 26000, 21000, 18000, 15000, 12000, 13000, 17000, 22000, 27000, 30000],
  waerme: [18000, 20000, 16000, 12000, 8000, 5000, 4000, 4500, 7000, 11000, 15000, 19000],
  wasser: [3200, 2900, 3100, 3400, 3800, 4200, 4500, 4300, 3700, 3300, 3000, 3100],
};

const ForecastWidget = ({ locationId }: ForecastWidgetProps) => {
  const isDemo = useDemoMode();
  const { t } = useTranslation();
  const [energyType, setEnergyType] = useState<string>("gas");

  const { data: monthly, isLoading } = useMonthlyConsumptionByType({
    locationId,
    energyType,
  });

  const ENERGY_TYPES = [
    { value: "strom", label: t("energy.strom" as any) },
    { value: "gas", label: t("energy.gas" as any) },
    { value: "waerme", label: t("energy.waerme" as any) },
    { value: "wasser", label: t("energy.wasser" as any) },
  ];

  // monthlyValues = array of 12 numbers (Wh)
  const monthlyValues = useMemo(() => {
    const real = (monthly ?? []).map((d) => d.value);
    if (real.length === 12 && real.some((v) => v > 0)) return real;

    if (isDemo) {
      const demo = DEMO_BY_TYPE[energyType] ?? DEMO_BY_TYPE.gas;
      const month = new Date().getMonth();
      return demo.map((v, i) => (i <= month ? v : 0));
    }
    return Array.from({ length: 12 }, () => 0);
  }, [monthly, isDemo, energyType]);

  const localizedMonths = MONTH_KEYS.map((k) => t(k as any));

  // Find last month with actual data
  const lastIdx = (() => {
    for (let i = monthlyValues.length - 1; i >= 0; i--) {
      if (monthlyValues[i] > 0) return i;
    }
    return -1;
  })();

  const hasData = lastIdx >= 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-[300px]" />
        </CardContent>
      </Card>
    );
  }

  const Header = (
    <CardHeader>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          {t("dashboard.annualForecast" as any)}
          <HelpTooltip text={t("tooltip.forecast" as any)} />
        </CardTitle>
        <Select value={energyType} onValueChange={setEnergyType}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENERGY_TYPES.map((et) => (
              <SelectItem key={et.value} value={et.value} className="text-xs">
                {et.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </CardHeader>
  );

  if (!hasData) {
    return (
      <Card>
        {Header}
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            {t("dashboard.noDataForForecast" as any)}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Forecast = average of months with data, projected over remaining months
  const actualSlice = monthlyValues.slice(0, lastIdx + 1);
  const totalActual = actualSlice.reduce((s, v) => s + v, 0);
  const avgPerMonth = totalActual / actualSlice.length;
  const forecastRemaining = Math.round(avgPerMonth) * (12 - actualSlice.length);
  const totalForecast = totalActual + forecastRemaining;

  const chartData = monthlyValues.map((v, i) => {
    const label = localizedMonths[i] || MONTH_KEYS[i];
    if (i < lastIdx) return { month: label, ist: v, prognose: null as number | null };
    if (i === lastIdx) return { month: label, ist: v, prognose: v }; // bridge point
    return { month: label, ist: null as number | null, prognose: Math.round(avgPerMonth) };
  });

  const actualLabel = t("dashboard.forecastActual" as any);
  const forecastLabel = t("dashboard.forecastForecast" as any);

  return (
    <Card>
      {Header}
      <CardHeader className="pt-0">
        <p className="text-sm text-muted-foreground">
          {t("dashboard.forecastTotal" as any).replace("{value}", formatEnergy(totalForecast))}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
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
