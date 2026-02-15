import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo } from "react";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from "date-fns";

interface PieChartWidgetProps {
  locationId: string | null;
}

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
};

const ENERGY_UNITS: Record<string, string> = {
  strom: "kWh",
  gas: "m³",
  waerme: "kWh",
  wasser: "m³",
};

const PERIOD_LABELS: Record<TimePeriod, string> = {
  day: "Tag",
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
  all: "Gesamt",
};

const PERIOD_TOTAL_KEY: Record<TimePeriod, "totalDay" | "totalWeek" | "totalMonth" | "totalYear" | null> = {
  day: "totalDay",
  week: "totalWeek",
  month: "totalMonth",
  quarter: null, // computed from archived months
  year: "totalYear",
  all: null,
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

const PieChartWidget = ({ locationId }: PieChartWidgetProps) => {
  const { locations } = useLocations();
  const { readings, livePeriodTotals, loading, hasData } = useEnergyData(locationId);
  const { meters } = useMeters(locationId || undefined);
  const { selectedPeriod, setSelectedPeriod } = useDashboardFilter();
  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const subtitle = selectedLocation ? `Daten für: ${selectedLocation.name}` : "Alle Liegenschaften";

  // Determine which energy types have active meters configured
  const configuredTypes = useMemo(() => {
    const types = new Set<string>();
    meters.filter(m => !m.is_archived).forEach(m => types.add(m.energy_type));
    return types;
  }, [meters]);

  // Build a meter_id -> energy_type map
  const meterMap = useMemo(() => {
    const map: Record<string, { energy_type: string; location_id: string }> = {};
    meters.forEach((m) => {
      map[m.id] = { energy_type: m.energy_type, location_id: m.location_id };
    });
    return map;
  }, [meters]);

  // Compute distribution based on selected period
  const chartData = useMemo(() => {
    const totals: Record<string, number> = { strom: 0, gas: 0, waerme: 0, wasser: 0 };
    const periodKey = PERIOD_TOTAL_KEY[selectedPeriod];
    const periodStart = getPeriodStart(selectedPeriod);

    // Manual readings filtered by period
    const autoMeterIds = new Set(
      meters.filter((m) => m.capture_type === "automatic" && !m.is_archived).map((m) => m.id)
    );

    readings
      .filter((r) => !autoMeterIds.has(r.meter_id))
      .filter((r) => {
        if (!periodStart) return true;
        return new Date(r.reading_date) >= periodStart;
      })
      .forEach((r) => {
        const energyType = meterMap[r.meter_id]?.energy_type || "strom";
        if (energyType in totals) {
          totals[energyType] += r.value;
        }
      });

    // Auto meters: use livePeriodTotals with the correct period key
    meters.filter(m => !m.is_archived && m.capture_type === "automatic").forEach(m => {
      if (locationId && meterMap[m.id]?.location_id !== locationId) return;
      const pt = livePeriodTotals[m.id];
      if (!pt) return;
      const val = periodKey ? pt[periodKey] : pt.totalYear; // "all" falls back to totalYear
      if (val != null && m.energy_type in totals) {
        totals[m.energy_type] += val;
      }
    });

    const total = Object.values(totals).reduce((s, v) => s + v, 0);

    const allTypes = ["strom", "gas", "waerme", "wasser"];
    const distribution = allTypes
      .filter(key => configuredTypes.size === 0 || configuredTypes.has(key))
      .map(key => ({
        name: ENERGY_LABELS[key],
        value: total > 0 ? Math.round((totals[key] / total) * 100) : 0,
        totalValue: Math.round(totals[key] * 100) / 100,
        unit: ENERGY_UNITS[key],
        color: `hsl(var(--energy-${key}))`,
      }));

    // Only show types with configured meters or non-zero values
    return distribution.filter(d => d.totalValue > 0 || configuredTypes.has(
      Object.entries(ENERGY_LABELS).find(([, label]) => label === d.name)?.[0] || ""
    ));
  }, [readings, livePeriodTotals, meters, meterMap, locationId, selectedPeriod, configuredTypes]);

  // For display: ensure at least a minimum visible slice for types with 0%
  const displayData = useMemo(() => {
    const hasNonZero = chartData.some(d => d.value > 0);
    if (!hasNonZero) return chartData;
    return chartData.map(d => ({
      ...d,
      displayValue: d.value === 0 ? 0.5 : d.value,
    }));
  }, [chartData]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[280px]" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="font-display text-lg">Energieverteilung</CardTitle>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as TimePeriod)}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] relative" style={{ zIndex: 0 }}>
          {displayData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Noch keine Verbrauchsdaten vorhanden
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={displayData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={4}
                  dataKey="displayValue"
                  nameKey="name"
                  animationBegin={0}
                  animationDuration={1200}
                  animationEasing="ease-out"
                >
                  {displayData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    color: "hsl(var(--card-foreground))",
                  }}
                  formatter={(value: number, name: string, props: any) => {
                    const realValue = props?.payload?.value ?? value;
                    const totalValue = props?.payload?.totalValue ?? 0;
                    const unit = props?.payload?.unit ?? "kWh";
                    return [`${totalValue.toLocaleString("de-DE")} ${unit} · ${realValue}%`, name];
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ color: "hsl(var(--foreground))", fontSize: "12px" }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PieChartWidget;
