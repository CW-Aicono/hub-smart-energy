import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useMeters } from "@/hooks/useMeters";
import { Leaf } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEnergy } from "@/lib/formatEnergy";
import { gasM3ToKWh } from "@/lib/formatEnergy";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from "date-fns";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";

const PERIOD_LABELS: Record<TimePeriod, string> = {
  day: "Tag",
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
  all: "Gesamt",
};

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

const PERIOD_TOTAL_KEY: Record<TimePeriod, "totalDay" | "totalWeek" | "totalMonth" | "totalYear" | null> = {
  day: "totalDay",
  week: "totalWeek",
  month: "totalMonth",
  quarter: null,
  year: "totalYear",
  all: null,
};

interface SustainabilityKPIsProps {
  locationId: string | null;
}

const SustainabilityKPIs = ({ locationId }: SustainabilityKPIsProps) => {
  const { readings, livePeriodTotals, loading } = useEnergyData(locationId);
  const { meters } = useMeters(locationId || undefined);
  const { selectedPeriod: period, setSelectedPeriod: setPeriod } = useDashboardFilter();
  const weekStartsOn = useWeekStartDay();

  // Build meter metadata map
  const meterMap = useMemo(() => {
    const map: Record<string, { energy_type: string; is_main_meter: boolean; capture_type: string; unit: string; gas_type: string | null; brennwert: number | null; zustandszahl: number | null }> = {};
    meters.forEach((m) => {
      map[m.id] = {
        energy_type: m.energy_type,
        is_main_meter: m.is_main_meter,
        capture_type: m.capture_type,
        unit: m.unit,
        gas_type: m.gas_type ?? null,
        brennwert: m.brennwert ?? null,
        zustandszahl: m.zustandszahl ?? null,
      };
    });
    return map;
  }, [meters]);

  /** Convert a raw value to Wh (base unit for formatEnergy) */
  const toWh = (value: number, energyType: string, unit: string, gasType: string | null, brennwert: number | null, zustandszahl: number | null): number => {
    if (energyType === "gas" && unit === "m³") {
      // m³ → kWh → Wh
      return gasM3ToKWh(value, gasType, brennwert, zustandszahl) * 1000;
    }
    if (energyType === "wasser") {
      // Water stays in m³, don't scale
      return value;
    }
    // Default: value is in kWh → ×1000 → Wh
    return value * 1000;
  };

  const filteredTotals = useMemo(() => {
    // Totals in Wh for strom/gas/waerme, m³ for wasser
    const totals = { strom: 0, gas: 0, waerme: 0, wasser: 0 };
    const periodStart = getPeriodStart(period, weekStartsOn);
    const ptKey = PERIOD_TOTAL_KEY[period];

    // Add automatic meter period totals (main meters only)
    if (ptKey) {
      meters.forEach(m => {
        if (m.is_archived || m.capture_type !== "automatic" || !m.is_main_meter) return;
        const pt = livePeriodTotals[m.id];
        if (!pt) return;
        const rawVal = pt[ptKey as keyof typeof pt];
        if (rawVal == null) return;
        const energyType = m.energy_type || "strom";
        if (energyType in totals) {
          if (energyType === "wasser") {
            (totals as any)[energyType] += rawVal;
          } else {
            (totals as any)[energyType] += toWh(rawVal, energyType, m.unit, m.gas_type ?? null, m.brennwert ?? null, m.zustandszahl ?? null);
          }
        }
      });
    }

    // Add manual meter readings (main meters only)
    readings.forEach((r) => {
      if (periodStart && new Date(r.reading_date) < periodStart) return;
      const meta = meterMap[r.meter_id];
      if (!meta || !meta.is_main_meter || meta.capture_type === "automatic") return;
      const energyType = meta.energy_type || "strom";
      if (energyType in totals) {
        if (energyType === "wasser") {
          (totals as any)[energyType] += r.value;
        } else {
          (totals as any)[energyType] += toWh(r.value, energyType, meta.unit, meta.gas_type, meta.brennwert, meta.zustandszahl);
        }
      }
    });

    return totals;
  }, [readings, meterMap, period, livePeriodTotals, meters, weekStartsOn]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[200px]" /></CardContent></Card>;

  // For total and progress bars, use Wh values for strom/gas/waerme
  const totalWhBased = filteredTotals.strom + filteredTotals.gas + filteredTotals.waerme;
  const hasFilteredData = totalWhBased > 0 || filteredTotals.wasser > 0;

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

  // Format water separately (m³)
  const fmtWater = (val: number) =>
    val.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " m³";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Leaf className="h-5 w-5 text-accent" />
            Verbrauchsübersicht
          </CardTitle>
          {periodSelect}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasFilteredData ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Noch keine Verbrauchsdaten vorhanden
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Gesamtverbrauch</span>
                <span className="text-sm font-display font-bold">{formatEnergy(totalWhBased)}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Strom</span>
                <span className="text-sm text-muted-foreground">{formatEnergy(filteredTotals.strom)}</span>
              </div>
              <Progress value={totalWhBased > 0 ? (filteredTotals.strom / totalWhBased) * 100 : 0} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Gas</span>
                <span className="text-sm text-muted-foreground">{formatEnergy(filteredTotals.gas)}</span>
              </div>
              <Progress value={totalWhBased > 0 ? (filteredTotals.gas / totalWhBased) * 100 : 0} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Wärme</span>
                <span className="text-sm text-muted-foreground">{formatEnergy(filteredTotals.waerme)}</span>
              </div>
              <Progress value={totalWhBased > 0 ? (filteredTotals.waerme / totalWhBased) * 100 : 0} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Wasser</span>
                <span className="text-sm text-muted-foreground">{fmtWater(filteredTotals.wasser)}</span>
              </div>
              <Progress value={0} className="h-2" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SustainabilityKPIs;
