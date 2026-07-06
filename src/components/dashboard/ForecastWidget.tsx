import { useEffect, useMemo, useState } from "react";
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
import { useLocationEnergyTypesSet } from "@/hooks/useLocationEnergySources";
import { useWeatherNormalization } from "@/hooks/useWeatherNormalization";
import { isHeatType } from "@/lib/report/weatherCorrection";

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

const ENERGY_UNITS: Record<string, "kWh" | "m³"> = {
  strom: "kWh",
  gas: "kWh",
  waerme: "kWh",
  wasser: "m³",
};

/**
 * Typische monatliche HDD-Verteilung Deutschland (DWD 1991–2020, Basis 15 °C).
 * Summe = 1.0. Wird für die Prognose zukünftiger Monate herangezogen, sodass
 * die Hochrechnung witterungsabhängig statt als flacher Monatsmittelwert
 * erfolgt.
 */
const TYPICAL_HDD_MONTH_SHARE = [
  0.170, 0.145, 0.120, 0.080, 0.040, 0.010,
  0.005, 0.005, 0.030, 0.080, 0.140, 0.175,
];
const REFERENCE_HDD_YEAR = 3200;

const SUPPORTED_TYPES = ["strom", "gas", "waerme", "wasser"] as const;

const ForecastWidget = ({ locationId }: ForecastWidgetProps) => {
  const isDemo = useDemoMode();
  const { t } = useTranslation();
  const tenantTypes = useLocationEnergyTypesSet(locationId);

  const availableTypes = useMemo(() => {
    // Nur Energiequellen, die im Tenant/Standort tatsächlich hinterlegt sind.
    // Im Demo-Modus alle unterstützten Typen zeigen, damit die Beispieldaten
    // sichtbar bleiben.
    if (isDemo) return [...SUPPORTED_TYPES] as string[];
    return SUPPORTED_TYPES.filter((t) => tenantTypes.has(t));
  }, [tenantTypes, isDemo]);

  const [energyType, setEnergyType] = useState<string>(availableTypes[0] ?? "strom");

  useEffect(() => {
    if (availableTypes.length === 0) return;
    if (!availableTypes.includes(energyType)) {
      setEnergyType(availableTypes[0]);
    }
  }, [availableTypes, energyType]);

  const { data: monthly, isLoading } = useMonthlyConsumptionByType({
    locationId,
    energyType,
  });

  const applyHdd = isHeatType(energyType);
  const { data: normData, hasData: hasNormData } = useWeatherNormalization({
    locationId,
    energyType,
  });

  const ENERGY_TYPES = [
    { value: "strom", label: t("energy.strom" as any) },
    { value: "gas", label: t("energy.gas" as any) },
    { value: "waerme", label: t("energy.waerme" as any) },
    { value: "wasser", label: t("energy.wasser" as any) },
  ].filter((et) => availableTypes.includes(et.value));

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
  const displayUnit = ENERGY_UNITS[energyType] ?? "kWh";

  const formatValueByType = (value: number) => {
    if (displayUnit === "m³") {
      return `${value.toLocaleString("de-DE", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })} m³`;
    }

    return formatEnergy(value);
  };

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
        {ENERGY_TYPES.length > 0 && (
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
        )}
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

  // -----------------------------------------------------------------------
  // Prognose je Restmonat
  //  - Heizenergie (isHeatType): witterungsabhängig
  //      forecast_m = avgWW + heatingPerHdd * expected_hdd_m
  //      expected_hdd_m = TYPICAL_HDD_MONTH_SHARE[m] * REFERENCE_HDD_YEAR
  //    heatingPerHdd wird aus den bisherigen Monaten mit HDD>0 berechnet
  //    (actual - Warmwasser-Sockel).
  //  - Sonst: flacher Mittelwert der bisherigen Monate.
  // -----------------------------------------------------------------------
  const actualSlice = monthlyValues.slice(0, lastIdx + 1);
  const totalActual = actualSlice.reduce((s, v) => s + v, 0);
  const avgPerMonth = totalActual / actualSlice.length;

  let forecastPerMonth: number[] = new Array(12).fill(0);

  if (applyHdd && hasNormData && normData.length > 0) {
    // Aggregierte Warmwasser-/Heizanteile über bisherige Monate (Wh)
    let sumHeatingWh = 0;
    let sumHdd = 0;
    let wwMonths = 0;
    let wwSum = 0;
    for (let i = 0; i <= lastIdx; i++) {
      const nd = normData[i];
      if (!nd) continue;
      const actualWh = nd.actualConsumption; // Wh
      const wwWh = Math.min(nd.hotWaterConsumption || 0, actualWh);
      const heatingWh = Math.max(0, actualWh - wwWh);
      if ((nd.degreeDays || 0) > 0 && heatingWh > 0) {
        sumHeatingWh += heatingWh;
        sumHdd += nd.degreeDays;
      }
      if (actualWh > 0) {
        wwMonths += 1;
        wwSum += wwWh;
      }
    }
    const heatingPerHdd = sumHdd > 0 ? sumHeatingWh / sumHdd : 0;
    const avgWwPerMonth = wwMonths > 0 ? wwSum / wwMonths : 0;

    for (let i = lastIdx + 1; i < 12; i++) {
      const expectedHdd = TYPICAL_HDD_MONTH_SHARE[i] * REFERENCE_HDD_YEAR;
      forecastPerMonth[i] = Math.round(avgWwPerMonth + heatingPerHdd * expectedHdd);
    }
  } else {
    for (let i = lastIdx + 1; i < 12; i++) {
      forecastPerMonth[i] = Math.round(avgPerMonth);
    }
  }

  const forecastRemaining = forecastPerMonth
    .slice(lastIdx + 1)
    .reduce((s, v) => s + v, 0);
  const totalForecast = totalActual + forecastRemaining;

  const chartData = monthlyValues.map((v, i) => {
    const label = localizedMonths[i] || MONTH_KEYS[i];
    if (i < lastIdx) return { month: label, ist: v, prognose: null as number | null };
    if (i === lastIdx) return { month: label, ist: v, prognose: v }; // bridge point
    return { month: label, ist: null as number | null, prognose: forecastPerMonth[i] };
  });

  const actualLabel = t("dashboard.forecastActual" as any);
  const forecastLabel = t("dashboard.forecastForecast" as any);

  return (
    <Card>
      {Header}
      <CardHeader className="pt-0">
        <p className="text-sm text-muted-foreground">
          {t("dashboard.forecastTotal" as any).replace("{value}", formatValueByType(totalForecast))}
          {applyHdd && hasNormData ? ` · ${t("dashboard.forecastHddNote" as any) || "witterungsbereinigte Hochrechnung"}` : ""}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value: number) => formatValueByType(value)}
              width={72}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                color: "hsl(var(--card-foreground))",
              }}
              formatter={(value: number | null, name: string) =>
                value !== null ? [formatValueByType(value), name === "ist" ? actualLabel : forecastLabel] : ["-", name]
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
