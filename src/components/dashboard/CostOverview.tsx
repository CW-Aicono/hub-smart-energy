import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useEnergyPrices } from "@/hooks/useEnergyPrices";
import { useMeters } from "@/hooks/useMeters";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";
import { Euro, TrendingDown, TrendingUp, ArrowDownRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, endOfWeek, endOfMonth, endOfQuarter, endOfYear, subDays, subWeeks, subMonths, subQuarters, subYears, format } from "date-fns";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { gasM3ToKWh } from "@/lib/formatEnergy";
import { useSpotPrices } from "@/hooks/useSpotPrices";
import { usePeriodSumsWithFallback } from "@/hooks/usePeriodSumsWithFallback";

interface CostOverviewProps {
  locationId: string | null;
}

function getPeriodRange(period: TimePeriod, weekStartsOn: 0|1|2|3|4|5|6 = 1): { start: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  let start: Date;
  let prevStart: Date;
  let prevEnd: Date;

  switch (period) {
    case "day":
      start = startOfDay(now);
      prevEnd = new Date(start.getTime() - 1);
      prevStart = startOfDay(subDays(now, 1));
      break;
    case "week":
      start = startOfWeek(now, { weekStartsOn });
      prevEnd = new Date(start.getTime() - 1);
      prevStart = startOfWeek(subWeeks(now, 1), { weekStartsOn });
      break;
    case "month":
      start = startOfMonth(now);
      prevEnd = new Date(start.getTime() - 1);
      prevStart = startOfMonth(subMonths(now, 1));
      break;
    case "quarter":
      start = startOfQuarter(now);
      prevEnd = new Date(start.getTime() - 1);
      prevStart = startOfQuarter(subQuarters(now, 1));
      break;
    case "year":
      start = startOfYear(now);
      prevEnd = new Date(start.getTime() - 1);
      prevStart = startOfYear(subYears(now, 1));
      break;
    case "all":
    default:
      start = new Date(0);
      prevStart = new Date(0);
      prevEnd = new Date(0);
      break;
  }

  return { start, prevStart, prevEnd };
}

const PERIOD_LABEL_KEYS: Record<TimePeriod, string> = {
  day: "cost.periodDay",
  week: "cost.periodWeek",
  month: "cost.periodMonth",
  quarter: "cost.periodQuarter",
  year: "cost.periodYear",
  all: "cost.periodAll",
};

const PREV_PERIOD_LABEL_KEYS: Record<TimePeriod, string> = {
  day: "cost.prevDay",
  week: "cost.prevWeek",
  month: "cost.prevMonth",
  quarter: "cost.prevQuarter",
  year: "cost.prevYear",
  all: "cost.prevAll",
};

const CostOverview = ({ locationId }: CostOverviewProps) => {
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const { readings, livePeriodTotals, loading: dataLoading } = useEnergyData(locationId);
  const { prices, loading: pricesLoading } = useEnergyPrices();
  const { meters } = useMeters();
  const { selectedPeriod } = useDashboardFilter();
  const weekStartsOn = useWeekStartDay();
  const { currentPrice: currentSpotPrice } = useSpotPrices();

  const meterMap = useMemo(() => {
    const map: Record<string, { energy_type: string; location_id: string; is_main_meter: boolean; unit: string; gas_type: string | null; brennwert: number | null; zustandszahl: number | null }> = {};
    meters.forEach((m) => {
      map[m.id] = { energy_type: m.energy_type, location_id: m.location_id, is_main_meter: m.is_main_meter, unit: m.unit, gas_type: m.gas_type ?? null, brennwert: m.brennwert ?? null, zustandszahl: m.zustandszahl ?? null };
    });
    return map;
  }, [meters]);

  const priceLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    const today = new Date().toISOString().split("T")[0];
    prices.forEach((p) => {
      if (p.valid_from <= today && (!p.valid_until || p.valid_until >= today)) {
        const key = `${p.location_id}:${p.energy_type}`;
        if (!lookup.has(key)) {
          if (p.is_dynamic && currentSpotPrice) {
            const spotEurKwh = currentSpotPrice.price_eur_mwh / 1000;
            lookup.set(key, spotEurKwh + Number(p.spot_markup_per_unit));
          } else if (!p.is_dynamic) {
            lookup.set(key, Number(p.price_per_unit));
          }
        }
      }
    });
    return lookup;
  }, [prices, currentSpotPrice]);

  // DB-backed period sums for current + previous period
  const mainAutoMeterIds = useMemo(
    () => meters.filter(m => !m.is_archived && m.capture_type === "automatic" && m.is_main_meter).map(m => m.id),
    [meters]
  );

  const { currentRangeDates, prevRangeDates, currentRange, prevRange } = useMemo(() => {
    const now = new Date();
    const computeRange = (period: TimePeriod, offset: number = 0) => {
      switch (period) {
        case "day": {
          const s = offset === 0 ? startOfDay(now) : startOfDay(subDays(now, 1));
          const e = offset === 0 ? now : new Date(startOfDay(now).getTime() - 1);
          return { start: s, end: e, from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
        }
        case "week": {
          const s = startOfWeek(offset === 0 ? now : subWeeks(now, 1), { weekStartsOn });
          const e = endOfWeek(s, { weekStartsOn });
          return { start: s, end: e, from: format(s, "yyyy-MM-dd"), to: format(e, "yyyy-MM-dd") };
        }
        case "month": {
          const s = offset === 0 ? startOfMonth(now) : startOfMonth(subMonths(now, 1));
          return { start: s, end: endOfMonth(s), from: format(s, "yyyy-MM-dd"), to: format(endOfMonth(s), "yyyy-MM-dd") };
        }
        case "quarter": {
          const s = offset === 0 ? startOfQuarter(now) : startOfQuarter(subQuarters(now, 1));
          return { start: s, end: endOfQuarter(s), from: format(s, "yyyy-MM-dd"), to: format(endOfQuarter(s), "yyyy-MM-dd") };
        }
        case "year": {
          const s = offset === 0 ? startOfYear(now) : startOfYear(subYears(now, 1));
          return { start: s, end: endOfYear(s), from: format(s, "yyyy-MM-dd"), to: format(endOfYear(s), "yyyy-MM-dd") };
        }
        default:
          return { start: startOfDay(now), end: now, from: format(startOfDay(now), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
      }
    };
    const curr = computeRange(selectedPeriod, 0);
    const prev = computeRange(selectedPeriod, -1);
    return {
      currentRangeDates: { start: curr.start, end: curr.end },
      prevRangeDates: { start: prev.start, end: prev.end },
      currentRange: { from: curr.from, to: curr.to },
      prevRange: { from: prev.from, to: prev.to },
    };
  }, [selectedPeriod, weekStartsOn]);

  const { data: dbCurrentSums } = usePeriodSumsWithFallback(
    "cost-current-sums",
    mainAutoMeterIds,
    currentRangeDates.start,
    currentRangeDates.end,
    selectedPeriod !== "day" && selectedPeriod !== "all",
  );

  const { data: dbPrevSums } = usePeriodSumsWithFallback(
    "cost-prev-sums",
    mainAutoMeterIds,
    prevRangeDates.start,
    prevRangeDates.end,
    selectedPeriod !== "all",
  );

  const costData = useMemo(() => {
    const { start, prevStart, prevEnd } = getPeriodRange(selectedPeriod, weekStartsOn);

    let currentCost = 0;
    let prevCost = 0;
    let currentConsumption = 0;

    readings.forEach((r) => {
      const date = new Date(r.reading_date);
      const meta = meterMap[r.meter_id];
      if (!meta || !meta.is_main_meter) return;

      let consumptionVal = r.value;
      if (meta.energy_type === "gas" && meta.unit === "m³") {
        consumptionVal = gasM3ToKWh(consumptionVal, meta.gas_type, meta.brennwert, meta.zustandszahl);
      }

      const priceKey = `${meta.location_id}:${meta.energy_type}`;
      const price = priceLookup.get(priceKey) || 0;

      if (date >= start) {
        currentCost += consumptionVal * price;
        currentConsumption += consumptionVal;
      } else if (selectedPeriod !== "all" && date >= prevStart && date <= prevEnd) {
        prevCost += consumptionVal * price;
      }
    });

    // Auto meters
    meters.forEach(m => {
      if (m.is_archived || m.capture_type !== "automatic" || !m.is_main_meter) return;
      if (locationId && m.location_id !== locationId) return;
      const meta = meterMap[m.id];
      if (!meta) return;
      const priceKey = `${meta.location_id}:${meta.energy_type}`;
      const price = priceLookup.get(priceKey) || 0;

      const toConsumption = (rawVal: number) => {
        if (meta.energy_type === "gas" && meta.unit === "m³") {
          return gasM3ToKWh(rawVal, meta.gas_type, meta.brennwert, meta.zustandszahl);
        }
        return rawVal;
      };

      // Current period
      let currentRaw: number | null = null;
      if (selectedPeriod === "day") {
        currentRaw = livePeriodTotals[m.id]?.totalDay ?? null;
      } else if (selectedPeriod === "all") {
        currentRaw = livePeriodTotals[m.id]?.totalYear ?? null;
      } else {
        const dbVal = dbCurrentSums?.[m.id] ?? 0;
        const todayVal = livePeriodTotals[m.id]?.totalDay ?? 0;
        currentRaw = dbVal + todayVal;
      }
      if (currentRaw != null && currentRaw > 0) {
        const c = toConsumption(currentRaw);
        currentCost += c * price;
        currentConsumption += c;
      }

      // Previous period (from DB)
      if (selectedPeriod !== "all") {
        const prevRaw = dbPrevSums?.[m.id] ?? 0;
        if (prevRaw > 0) {
          prevCost += toConsumption(prevRaw) * price;
        }
      }
    });

    const diff = prevCost - currentCost;
    const diffPercent = prevCost > 0 ? Math.round((diff / prevCost) * 1000) / 10 : 0;
    const hasPrices = priceLookup.size > 0;

    return { currentCost, prevCost, diff, diffPercent, hasPrices, currentConsumption };
  }, [readings, meterMap, priceLookup, selectedPeriod, livePeriodTotals, meters, locationId, dbCurrentSums, dbPrevSums]);

  const loading = dataLoading || pricesLoading;

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-16" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const formatCurrency = (value: number) =>
    value.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const kpis = [
    {
      label: T("cost.costs"),
      value: costData.hasPrices && costData.currentCost > 0 ? formatCurrency(costData.currentCost) : "–",
      icon: Euro,
      subtitle: T(PERIOD_LABEL_KEYS[selectedPeriod]),
    },
    {
      label: T("cost.prevPeriod"),
      value: costData.hasPrices && costData.prevCost > 0 ? formatCurrency(costData.prevCost) : "–",
      icon: TrendingUp,
      subtitle: T(PREV_PERIOD_LABEL_KEYS[selectedPeriod]),
    },
    {
      label: T("cost.difference"),
      value: costData.hasPrices && costData.diff !== 0 ? formatCurrency(Math.abs(costData.diff)) : "–",
      icon: TrendingDown,
      subtitle: costData.diffPercent !== 0
        ? `${costData.diffPercent > 0 ? costData.diffPercent : Math.abs(costData.diffPercent)}% ${costData.diff > 0 ? T("cost.less") : T("cost.more")}`
        : costData.hasPrices ? T("cost.noChange") : T("cost.noPrices"),
      positive: costData.diff > 0,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
            <kpi.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-display font-bold">{kpi.value}</div>
            <p className={`text-xs mt-1 ${kpi.positive ? "text-accent" : "text-muted-foreground"}`}>
              {kpi.positive && <ArrowDownRight className="inline h-3 w-3 mr-1" />}
              {kpi.subtitle}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default CostOverview;