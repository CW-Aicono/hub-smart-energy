import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useMeters } from "@/hooks/useMeters";
import { Leaf } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEnergy, formatEnergyByType } from "@/lib/formatEnergy";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from "date-fns";
import { useDashboardFilter, TimePeriod } from "@/hooks/useDashboardFilter";

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

interface SustainabilityKPIsProps {
  locationId: string | null;
}

const SustainabilityKPIs = ({ locationId }: SustainabilityKPIsProps) => {
  const { readings, loading, hasData } = useEnergyData(locationId);
  const { meters } = useMeters();
  const { selectedPeriod: period, setSelectedPeriod: setPeriod } = useDashboardFilter();

  const meterMap = useMemo(() => {
    const map: Record<string, string> = {};
    meters.forEach((m) => { map[m.id] = m.energy_type; });
    return map;
  }, [meters]);

  const filteredTotals = useMemo(() => {
    const totals = { strom: 0, gas: 0, waerme: 0, wasser: 0 };
    const periodStart = getPeriodStart(period);
    readings.forEach((r) => {
      if (periodStart && new Date(r.reading_date) < periodStart) return;
      const energyType = meterMap[r.meter_id] || "strom";
      if (energyType in totals) {
        (totals as any)[energyType] += r.value;
      }
    });
    return totals;
  }, [readings, meterMap, period]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[200px]" /></CardContent></Card>;

  const totalConsumption = filteredTotals.strom + filteredTotals.gas + filteredTotals.waerme + filteredTotals.wasser;
  const hasFilteredData = totalConsumption > 0;

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
                <span className="text-sm font-display font-bold">{formatEnergy(totalConsumption)}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Strom</span>
                <span className="text-sm text-muted-foreground">{formatEnergyByType(filteredTotals.strom, "strom")}</span>
              </div>
              <Progress value={totalConsumption > 0 ? (filteredTotals.strom / totalConsumption) * 100 : 0} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Gas</span>
                <span className="text-sm text-muted-foreground">{formatEnergyByType(filteredTotals.gas, "gas")}</span>
              </div>
              <Progress value={totalConsumption > 0 ? (filteredTotals.gas / totalConsumption) * 100 : 0} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Wärme</span>
                <span className="text-sm text-muted-foreground">{formatEnergyByType(filteredTotals.waerme, "waerme")}</span>
              </div>
              <Progress value={totalConsumption > 0 ? (filteredTotals.waerme / totalConsumption) * 100 : 0} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Wasser</span>
                <span className="text-sm text-muted-foreground">{formatEnergyByType(filteredTotals.wasser, "wasser")}</span>
              </div>
              <Progress value={totalConsumption > 0 ? (filteredTotals.wasser / totalConsumption) * 100 : 0} className="h-2" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SustainabilityKPIs;
