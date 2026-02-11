import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useMeters } from "@/hooks/useMeters";
import { useLocations } from "@/hooks/useLocations";
import { Skeleton } from "@/components/ui/skeleton";
import { ENERGY_CHART_COLORS } from "@/lib/energyTypeColors";
import { getEnergyUnit } from "@/lib/formatEnergy";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from "date-fns";

type TimePeriod = "day" | "week" | "month" | "quarter" | "year" | "all";

const PERIOD_LABELS: Record<TimePeriod, string> = {
  day: "Tag",
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
  all: "Gesamt",
};

function getPeriodStart(period: TimePeriod): Date | null {
  const now = new Date();
  switch (period) {
    case "day": return startOfDay(now);
    case "week": return startOfWeek(now, { weekStartsOn: 1 });
    case "month": return startOfMonth(now);
    case "quarter": return startOfQuarter(now);
    case "year": return startOfYear(now);
    case "all": return null;
  }
}

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function getEnergyScale(maxValue: number): { divisor: number; unit: string } {
  if (maxValue > 9999) return { divisor: 1_000, unit: "MWh" };
  if (maxValue > 999) return { divisor: 1, unit: "kWh" };
  return { divisor: 0.001, unit: "Wh" };
}

interface EnergyChartProps {
  locationId: string | null;
}

const EnergyChart = ({ locationId }: EnergyChartProps) => {
  const { locations } = useLocations();
  const { readings, loading, hasData } = useEnergyData(locationId);
  const { meters } = useMeters();
  const [period, setPeriod] = useState<TimePeriod>("day");
  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;

  const subtitle = selectedLocation
    ? `Daten für: ${selectedLocation.name}`
    : "Alle Liegenschaften";

  const meterMap = useMemo(() => {
    const map: Record<string, string> = {};
    meters.forEach((m) => { map[m.id] = m.energy_type; });
    return map;
  }, [meters]);

  // Filter readings by period and build monthly buckets
  const { scaledData, unit } = useMemo(() => {
    const periodStart = getPeriodStart(period);
    const buckets: Record<string, { strom: number; gas: number; waerme: number; wasser: number }> = {};
    MONTH_LABELS.forEach((m) => { buckets[m] = { strom: 0, gas: 0, waerme: 0, wasser: 0 }; });

    readings.forEach((r) => {
      if (periodStart && new Date(r.reading_date) < periodStart) return;
      const date = new Date(r.reading_date);
      const monthLabel = MONTH_LABELS[date.getMonth()];
      const energyType = meterMap[r.meter_id] || "strom";
      if (buckets[monthLabel] && energyType in buckets[monthLabel]) {
        (buckets[monthLabel] as any)[energyType] += r.value;
      }
    });

    const monthlyData = MONTH_LABELS.map((m) => ({ month: m, ...buckets[m] }));

    const maxVal = monthlyData.reduce((max, d) => {
      return Math.max(max, d.strom || 0, d.gas || 0, d.waerme || 0, d.wasser || 0);
    }, 0);

    const scale = getEnergyScale(maxVal);
    const scaled = monthlyData.map((d) => ({
      ...d,
      strom: d.strom ? d.strom / scale.divisor : 0,
      gas: d.gas ? d.gas / scale.divisor : 0,
      waerme: d.waerme ? d.waerme / scale.divisor : 0,
      wasser: d.wasser ? d.wasser / scale.divisor : 0,
    }));

    return { scaledData: scaled, unit: scale.unit };
  }, [readings, meterMap, period]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[300px]" /></CardContent></Card>;

  const periodSelect = (
    <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
      <SelectTrigger className="w-[120px] h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map((key) => (
          <SelectItem key={key} value={key}>{PERIOD_LABELS[key]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg">Energieverbrauch ({unit})</CardTitle>
          {periodSelect}
        </div>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            Noch keine Verbrauchsdaten vorhanden
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scaledData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  color: 'hsl(var(--card-foreground))',
                }}
                formatter={(value: number, name: string) => {
                  const typeKey = name === "Strom" ? "strom" : name === "Gas" ? "gas" : name === "Wärme" ? "waerme" : name === "Wasser" ? "wasser" : "strom";
                  const displayUnit = getEnergyUnit(typeKey);
                  return [
                    `${value.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${displayUnit}`,
                    name,
                  ];
                }}
              />
              <Legend />
              <Bar dataKey="strom" name="Strom" fill={ENERGY_CHART_COLORS.strom} radius={[2, 2, 0, 0]} />
              <Bar dataKey="gas" name="Gas" fill={ENERGY_CHART_COLORS.gas} radius={[2, 2, 0, 0]} />
              <Bar dataKey="waerme" name="Wärme" fill={ENERGY_CHART_COLORS.waerme} radius={[2, 2, 0, 0]} />
              <Bar dataKey="wasser" name="Wasser" fill={ENERGY_CHART_COLORS.wasser} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default EnergyChart;
