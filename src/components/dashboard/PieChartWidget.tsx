import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo } from "react";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";
import { useTranslation } from "@/hooks/useTranslation";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, endOfWeek, endOfMonth, endOfQuarter, endOfYear, format } from "date-fns";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { gasM3ToKWh } from "@/lib/formatEnergy";
import { useLocationEnergyTypesSet } from "@/hooks/useLocationEnergySources";
import { usePeriodSumsWithFallback } from "@/hooks/usePeriodSumsWithFallback";

interface PieChartWidgetProps {
  locationId: string | null;
}

// Energy labels/units are now dynamic via t() below

function getPeriodStart(period: TimePeriod, weekStartsOn: 0|1|2|3|4|5|6 = 1): Date | null {
  const now = new Date();
  switch (period) {
    case "day": return startOfDay(now);
    case "week": return startOfWeek(now, { weekStartsOn });
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
  const weekStartsOn = useWeekStartDay();
  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const ENERGY_LABELS: Record<string, string> = { strom: T("energy.strom"), gas: T("energy.gas"), waerme: T("energy.waerme"), wasser: T("energy.wasser") };
  const ENERGY_UNITS: Record<string, string> = { strom: "kWh", gas: "kWh", waerme: "kWh", wasser: "m³" };
  const PERIOD_LABELS: Record<TimePeriod, string> = { day: T("chart.periodDay"), week: T("chart.periodWeek"), month: T("chart.periodMonth"), quarter: T("chart.periodQuarter"), year: T("chart.periodYear"), all: T("chart.periodAll") };
  const subtitle = selectedLocation ? T("chart.dataFor").replace("{name}", selectedLocation.name) : T("chart.allLocations");
  const allowedTypes = useLocationEnergyTypesSet(locationId);

  const configuredTypes = useMemo(() => {
    const types = new Set<string>();
    meters.filter(m => !m.is_archived).forEach(m => types.add(m.energy_type));
    return types;
  }, [meters]);

  const meterMap = useMemo(() => {
    const map: Record<string, { energy_type: string; location_id: string; is_main_meter: boolean; capture_type: string; unit: string; gas_type: string | null; brennwert: number | null; zustandszahl: number | null }> = {};
    meters.forEach((m) => {
      map[m.id] = { energy_type: m.energy_type, location_id: m.location_id, is_main_meter: m.is_main_meter, capture_type: m.capture_type, unit: m.unit, gas_type: m.gas_type ?? null, brennwert: m.brennwert ?? null, zustandszahl: m.zustandszahl ?? null };
    });
    return map;
  }, [meters]);

  // DB-backed period sums
  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    switch (selectedPeriod) {
      case "week": return { rangeStart: startOfWeek(now, { weekStartsOn }), rangeEnd: endOfWeek(now, { weekStartsOn }) };
      case "month": return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) };
      case "quarter": return { rangeStart: startOfQuarter(now), rangeEnd: endOfQuarter(now) };
      case "year": return { rangeStart: startOfYear(now), rangeEnd: endOfYear(now) };
      default: return { rangeStart: startOfDay(now), rangeEnd: now };
    }
  }, [selectedPeriod, weekStartsOn]);

  const mainAutoMeterIds = useMemo(
    () => meters.filter(m => !m.is_archived && m.capture_type === "automatic" && m.is_main_meter).map(m => m.id),
    [meters]
  );

  const { data: dbPeriodSums } = usePeriodSumsWithFallback(
    "pie-period-sums",
    mainAutoMeterIds,
    rangeStart,
    rangeEnd,
    selectedPeriod !== "day" && selectedPeriod !== "all",
  );

  const chartData = useMemo(() => {
    const totals: Record<string, number> = { strom: 0, gas: 0, waerme: 0, wasser: 0 };
    const periodStart = getPeriodStart(selectedPeriod, weekStartsOn);

    // Manual readings filtered by period
    const autoMeterIds = new Set(
      meters.filter((m) => m.capture_type === "automatic" && !m.is_archived).map((m) => m.id)
    );

    readings
      .filter((r) => !autoMeterIds.has(r.meter_id))
      .filter((r) => {
        const meta = meterMap[r.meter_id];
        if (!meta || !meta.is_main_meter) return false;
        if (!periodStart) return true;
        return new Date(r.reading_date) >= periodStart;
      })
      .forEach((r) => {
        const meta = meterMap[r.meter_id];
        const energyType = meta?.energy_type || "strom";
        if (energyType in totals) {
          let val = r.value;
          if (energyType === "gas" && meta && meta.unit === "m³") {
            val = gasM3ToKWh(val, meta.gas_type, meta.brennwert, meta.zustandszahl);
          }
          totals[energyType] += val;
        }
      });

    // Auto meters: DB sums + live today for non-day periods
    meters.filter(m => !m.is_archived && m.capture_type === "automatic" && m.is_main_meter).forEach(m => {
      if (locationId && meterMap[m.id]?.location_id !== locationId) return;
      const energyType = m.energy_type;
      if (!(energyType in totals)) return;

      let rawVal: number | null = null;
      if (selectedPeriod === "day") {
        rawVal = livePeriodTotals[m.id]?.totalDay ?? null;
      } else if (selectedPeriod === "all") {
        rawVal = livePeriodTotals[m.id]?.totalYear ?? null;
      } else {
        const dbVal = dbPeriodSums?.[m.id] ?? 0;
        const todayVal = livePeriodTotals[m.id]?.totalDay ?? 0;
        rawVal = dbVal + todayVal;
      }

      if (rawVal != null && rawVal > 0) {
        let val = rawVal;
        if (energyType === "gas" && m.unit === "m³") {
          val = gasM3ToKWh(val, m.gas_type ?? null, m.brennwert ?? null, m.zustandszahl ?? null);
        }
        totals[energyType] += val;
      }
    });

    const total = Object.values(totals).reduce((s, v) => s + v, 0);

    const allTypes = ["strom", "gas", "waerme", "wasser"];
    const distribution = allTypes
      .filter(key => allowedTypes.has(key))
      .filter(key => configuredTypes.size === 0 || configuredTypes.has(key))
      .map(key => ({
        name: ENERGY_LABELS[key],
        value: total > 0 ? Math.round((totals[key] / total) * 100) : 0,
        totalValue: Math.round(totals[key] * 100) / 100,
        unit: ENERGY_UNITS[key],
        color: `hsl(var(--energy-${key}))`,
      }));

    return distribution.filter(d => d.totalValue > 0 || configuredTypes.has(
      Object.entries(ENERGY_LABELS).find(([, label]) => label === d.name)?.[0] || ""
    ));
  }, [readings, livePeriodTotals, meters, meterMap, locationId, selectedPeriod, configuredTypes, dbPeriodSums]);

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
            <CardTitle className="font-display text-lg">{T("pie.title")}</CardTitle>
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
              {T("chart.noData")}
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