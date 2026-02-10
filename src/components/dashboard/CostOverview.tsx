import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEnergyData } from "@/hooks/useEnergyData";
import { Euro, TrendingDown, TrendingUp, ArrowDownRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface CostOverviewProps {
  locationId: string | null;
}

const CostOverview = ({ locationId }: CostOverviewProps) => {
  const { costOverview, loading } = useEnergyData(locationId);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-16" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const kpis = [
    {
      label: "Aktuelle Ablesungen",
      value: costOverview.currentMonth > 0 ? `${costOverview.currentMonth.toLocaleString("de-DE")} kWh` : "–",
      icon: Euro,
      subtitle: "Laufender Monat",
    },
    {
      label: "Vormonat",
      value: costOverview.previousMonth > 0 ? `${costOverview.previousMonth.toLocaleString("de-DE")} kWh` : "–",
      icon: TrendingUp,
      subtitle: "Letzter Monat",
    },
    {
      label: "Differenz",
      value: costOverview.savings > 0 ? `${costOverview.savings.toLocaleString("de-DE")} kWh` : "–",
      icon: TrendingDown,
      subtitle: costOverview.savingsPercent > 0 ? `${costOverview.savingsPercent}% weniger` : "Keine Daten",
      positive: costOverview.savings > 0,
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
