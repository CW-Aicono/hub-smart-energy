import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { Tooltip as ShadTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";
import { Thermometer, TrendingDown, TrendingUp } from "lucide-react";
import { useWeatherNormalization } from "@/hooks/useWeatherNormalization";
import { formatEnergy } from "@/lib/formatEnergy";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WeatherNormalizationWidgetProps {
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const ENERGY_TYPES = [
  { value: "gas", label: "Gas" },
  { value: "waerme", label: "Wärme" },
  { value: "strom", label: "Strom" },
];

const PERIOD_OPTIONS = [
  { value: "month", label: "Monat" },
  { value: "quarter", label: "Quartal" },
  { value: "year", label: "Jahr" },
];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const QUARTERS = ["Q1 (Jan–Mär)", "Q2 (Apr–Jun)", "Q3 (Jul–Sep)", "Q4 (Okt–Dez)"];

const WeatherNormalizationWidget = ({ locationId, onExpand, onCollapse }: WeatherNormalizationWidgetProps) => {
  const [energyType, setEnergyType] = useState("gas");
  const { t } = useTranslation();
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("year");
  const [year, setYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(currentMonth / 3));
  const [refTemp, setRefTemp] = useState(15);

  const {
    data,
    loading,
    error,
    hasData,
  } = useWeatherNormalization({
    locationId,
    energyType,
    referenceTemperature: refTemp,
    year,
  });

  // Full month names for tooltip
  const FULL_MONTHS = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];

  // Filter data based on selected period
  const filteredData = useMemo(() => {
    if (period === "year") return data;
    if (period === "month") {
      return data.filter((d) => new Date(d.month).getMonth() === selectedMonth);
    }
    // quarter
    const startMonth = selectedQuarter * 3;
    return data.filter((d) => {
      const m = new Date(d.month).getMonth();
      return m >= startMonth && m < startMonth + 3;
    });
  }, [data, period, selectedMonth, selectedQuarter]);

  // Determine unit scaling: values are in Wh
  const maxValue = useMemo(() => {
    let max = 0;
    for (const d of filteredData) {
      if (d.actualConsumption > max) max = d.actualConsumption;
      if (d.normalizedConsumption > max) max = d.normalizedConsumption;
    }
    return max;
  }, [filteredData]);

  // >= 1,000,000 Wh (1000 kWh) → show MWh, else kWh
  const useMWh = maxValue >= 1_000_000;
  const yAxisUnit = useMWh ? "MWh" : "kWh";
  const yAxisDivisor = useMWh ? 1_000_000 : 1_000; // Wh → MWh or kWh

  const chartData = useMemo(() => {
    return filteredData.map((d) => ({
      ...d,
      actualScaled: d.actualConsumption / yAxisDivisor,
      normalizedScaled: d.normalizedConsumption / yAxisDivisor,
      fullMonthLabel: FULL_MONTHS[new Date(d.month).getMonth()] || d.monthLabel,
    }));
  }, [filteredData, yAxisDivisor]);

  const filteredTotalActual = filteredData.reduce((s, d) => s + d.actualConsumption, 0);
  const filteredTotalNormalized = filteredData.reduce((s, d) => s + d.normalizedConsumption, 0);
  const filteredTotalDeviation = filteredTotalActual > 0
    ? Math.round(((filteredTotalNormalized - filteredTotalActual) / filteredTotalActual) * 10000) / 100
    : 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-[400px]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Thermometer className="h-5 w-5 text-primary" />
            {t("dashboard.weatherNorm" as any)}
            <HelpTooltip text={t("tooltip.weatherNorm" as any)} />
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={energyType} onValueChange={setEnergyType}>
              <SelectTrigger className="h-8 w-[100px] text-xs">
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
            <Select value={period} onValueChange={(v) => setPeriod(v as "month" | "quarter" | "year")}>
              <SelectTrigger className="h-8 w-[90px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[80px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)} className="text-xs">
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {period === "quarter" && (
              <Select value={String(selectedQuarter)} onValueChange={(v) => setSelectedQuarter(Number(v))}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUARTERS.map((q, i) => (
                    <SelectItem key={i} value={String(i)} className="text-xs">
                      {q}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {period === "month" && (
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i)} className="text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ShadTooltip>
              <TooltipTrigger asChild>
                <div>
                  <Select value={String(refTemp)} onValueChange={(v) => setRefTemp(Number(v))}>
                    <SelectTrigger className="h-8 w-[80px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[12, 13, 14, 15, 16, 17, 18].map((t) => (
                        <SelectItem key={t} value={String(t)} className="text-xs">
                          {t}°C
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                {t("tooltip.refTemp" as any)}
              </TooltipContent>
            </ShadTooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="h-[300px] flex items-center justify-center text-destructive text-sm">{error}</div>
        ) : !hasData && !loading ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            Keine Verbrauchsdaten für diesen Standort/Zeitraum vorhanden
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Ist-Verbrauch</p>
                <p className="text-lg font-semibold">{formatEnergy(filteredTotalActual)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Bereinigt</p>
                <p className="text-lg font-semibold">{formatEnergy(filteredTotalNormalized)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Abweichung</p>
                <p className={`text-lg font-semibold flex items-center justify-center gap-1 ${filteredTotalDeviation > 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {filteredTotalDeviation > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {filteredTotalDeviation > 0 ? "+" : ""}{filteredTotalDeviation}%
                </p>
              </div>
            </div>

            <Tabs defaultValue="chart">
              <TabsList className="mb-3">
                <TabsTrigger value="chart">Diagramm</TabsTrigger>
                <TabsTrigger value="table">Tabelle</TabsTrigger>
              </TabsList>

              <TabsContent value="chart">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="monthLabel" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      label={{ value: yAxisUnit, angle: -90, position: "insideLeft", style: { fill: "hsl(var(--muted-foreground))", fontSize: 12 } }}
                      tickFormatter={(v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                        color: "hsl(var(--card-foreground))",
                      }}
                      labelFormatter={(label: string, payload: any[]) => {
                        if (payload?.[0]?.payload?.fullMonthLabel) return payload[0].payload.fullMonthLabel;
                        return label;
                      }}
                      formatter={(value: number, name: string) => [
                        value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + yAxisUnit,
                        name === "actualScaled" ? "Ist-Verbrauch" : "Bereinigt",
                      ]}
                    />
                    <Legend formatter={(v) => (v === "actualScaled" ? "Ist-Verbrauch" : "Bereinigt")} />
                    <Bar dataKey="actualScaled" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="normalizedScaled" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              <TabsContent value="table">
                <div className="max-h-[300px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Monat</TableHead>
                        <TableHead className="text-right">Gradtage</TableHead>
                        <TableHead className="text-right">Ø Temp.</TableHead>
                        <TableHead className="text-right">Ist</TableHead>
                        <TableHead className="text-right">Bereinigt</TableHead>
                        <TableHead className="text-right">Abw.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="font-medium">{row.monthLabel}</TableCell>
                          <TableCell className="text-right">{row.degreeDays.toFixed(1)}</TableCell>
                          <TableCell className="text-right">{row.avgTemperature.toFixed(1)}°C</TableCell>
                          <TableCell className="text-right">{formatEnergy(row.actualConsumption)}</TableCell>
                          <TableCell className="text-right">{formatEnergy(row.normalizedConsumption)}</TableCell>
                          <TableCell className={`text-right ${row.deviationPercent > 0 ? "text-destructive" : "text-emerald-600"}`}>
                            {row.deviationPercent > 0 ? "+" : ""}{row.deviationPercent}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WeatherNormalizationWidget;
