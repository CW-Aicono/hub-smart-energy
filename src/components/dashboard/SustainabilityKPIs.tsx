import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useMeters } from "@/hooks/useMeters";
import { Leaf } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEnergy } from "@/lib/formatEnergy";
import { gasM3ToKWh } from "@/lib/formatEnergy";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, endOfWeek, endOfMonth, endOfQuarter, endOfYear, format } from "date-fns";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";
import { useLocationEnergySources } from "@/hooks/useLocationEnergySources";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PERIOD_LABEL_KEYS: Record<TimePeriod, string> = {
  day: "chart.periodDay",
  week: "chart.periodWeek",
  month: "chart.periodMonth",
  quarter: "chart.periodQuarter",
  year: "chart.periodYear",
  all: "chart.periodAll",
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

interface SustainabilityKPIsProps {
  locationId: string | null;
}

const SustainabilityKPIs = ({ locationId }: SustainabilityKPIsProps) => {
  const { readings, livePeriodTotals, loading } = useEnergyData(locationId);
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const { meters } = useMeters(locationId || undefined);
  const { selectedPeriod: period, setSelectedPeriod: setPeriod } = useDashboardFilter();
  const weekStartsOn = useWeekStartDay();
  const allowedTypes = useLocationEnergySources(locationId);

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
      return gasM3ToKWh(value, gasType, brennwert, zustandszahl) * 1000;
    }
    if (energyType === "wasser") {
      return value;
    }
    return value * 1000;
  };

  // Compute date range for DB query
  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "week": return { rangeStart: startOfWeek(now, { weekStartsOn }), rangeEnd: endOfWeek(now, { weekStartsOn }) };
      case "month": return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) };
      case "quarter": return { rangeStart: startOfQuarter(now), rangeEnd: endOfQuarter(now) };
      case "year": return { rangeStart: startOfYear(now), rangeEnd: endOfYear(now) };
      default: return { rangeStart: startOfDay(now), rangeEnd: now };
    }
  }, [period, weekStartsOn]);

  const mainAutoMeterIds = useMemo(
    () => meters.filter(m => !m.is_archived && m.capture_type === "automatic" && m.is_main_meter).map(m => m.id),
    [meters]
  );

  const { data: dbPeriodSums } = useQuery({
    queryKey: ["sustainability-period-sums", mainAutoMeterIds, format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd"), period],
    enabled: period !== "day" && period !== "all" && mainAutoMeterIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_meter_period_sums", {
        p_meter_ids: mainAutoMeterIds,
        p_from_date: format(rangeStart, "yyyy-MM-dd"),
        p_to_date: format(rangeEnd, "yyyy-MM-dd"),
      });
      if (error) { console.error("Sustainability period sums error:", error); return {}; }
      const map: Record<string, number> = {};
      (data ?? []).forEach((row: any) => { map[row.meter_id] = row.total_value; });
      return map;
    },
  });

  const filteredTotals = useMemo(() => {
    const totals = { strom: 0, gas: 0, waerme: 0, wasser: 0 };
    const periodStart = getPeriodStart(period, weekStartsOn);

    // Auto meters: DB sums + live today for non-day, or live totalDay for day
    meters.forEach(m => {
      if (m.is_archived || m.capture_type !== "automatic" || !m.is_main_meter) return;
      const energyType = m.energy_type || "strom";
      if (!(energyType in totals)) return;

      let rawVal: number | null = null;
      if (period === "day") {
        rawVal = livePeriodTotals[m.id]?.totalDay ?? null;
      } else if (period === "all") {
        rawVal = livePeriodTotals[m.id]?.totalYear ?? null;
      } else {
        const dbVal = dbPeriodSums?.[m.id] ?? 0;
        const todayVal = livePeriodTotals[m.id]?.totalDay ?? 0;
        rawVal = dbVal + todayVal;
      }

      if (rawVal == null || rawVal <= 0) return;
      if (energyType === "wasser") {
        (totals as any)[energyType] += rawVal;
      } else {
        (totals as any)[energyType] += toWh(rawVal, energyType, m.unit, m.gas_type ?? null, m.brennwert ?? null, m.zustandszahl ?? null);
      }
    });

    // Manual meter readings (main meters only)
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
  }, [readings, meterMap, period, livePeriodTotals, meters, weekStartsOn, dbPeriodSums]);

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
        {(Object.keys(PERIOD_LABEL_KEYS) as TimePeriod[]).map((key) => (
          <SelectItem key={key} value={key}>{T(PERIOD_LABEL_KEYS[key])}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const fmtWater = (val: number) =>
    val.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " m³";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Leaf className="h-5 w-5 text-accent" />
            {t("dashboard.consumptionOverview" as any)}
            <HelpTooltip text={t("tooltip.sustainability" as any)} />
          </CardTitle>
          {periodSelect}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasFilteredData ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {T("dashboard.noConsumptionData")}
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{T("dashboard.totalConsumption")}</span>
                <span className="text-sm font-display font-bold">{formatEnergy(totalWhBased)}</span>
              </div>
            </div>

            {allowedTypes.has("strom") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{T("energy.strom")}</span>
                  <span className="text-sm text-muted-foreground">{formatEnergy(filteredTotals.strom)}</span>
                </div>
                <Progress value={totalWhBased > 0 ? (filteredTotals.strom / totalWhBased) * 100 : 0} className="h-2" />
              </div>
            )}

            {allowedTypes.has("gas") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{T("energy.gas")}</span>
                  <span className="text-sm text-muted-foreground">{formatEnergy(filteredTotals.gas)}</span>
                </div>
                <Progress value={totalWhBased > 0 ? (filteredTotals.gas / totalWhBased) * 100 : 0} className="h-2" />
              </div>
            )}

            {allowedTypes.has("waerme") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{T("energy.waerme")}</span>
                  <span className="text-sm text-muted-foreground">{formatEnergy(filteredTotals.waerme)}</span>
                </div>
                <Progress value={totalWhBased > 0 ? (filteredTotals.waerme / totalWhBased) * 100 : 0} className="h-2" />
              </div>
            )}

            {allowedTypes.has("wasser") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{T("energy.wasser")}</span>
                  <span className="text-sm text-muted-foreground">{fmtWater(filteredTotals.wasser)}</span>
                </div>
                <Progress value={0} className="h-2" />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SustainabilityKPIs;
