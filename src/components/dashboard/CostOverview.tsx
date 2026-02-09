import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { costOverview } from "@/data/mockData";
import { Euro, TrendingDown, TrendingUp, ArrowDownRight, Download } from "lucide-react";
import { downloadCSV } from "@/lib/exportUtils";

interface CostOverviewProps {
  locationId: string | null;
}

const kpis = [
  {
    label: "Aktuelle Kosten",
    value: `€${costOverview.currentMonth.toLocaleString("de-DE")}`,
    icon: Euro,
    subtitle: "Laufender Monat",
  },
  {
    label: "Vormonat",
    value: `€${costOverview.previousMonth.toLocaleString("de-DE")}`,
    icon: TrendingUp,
    subtitle: "Letzter Monat",
  },
  {
    label: "Einsparungen",
    value: `€${costOverview.savings.toLocaleString("de-DE")}`,
    icon: TrendingDown,
    subtitle: `${costOverview.savingsPercent}% weniger`,
    positive: true,
  },
];

const CostOverview = ({ locationId }: CostOverviewProps) => {
  // In a real implementation, filter data by locationId
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCSV(
              [{ Kategorie: "Aktuelle Kosten", Wert: costOverview.currentMonth }, { Kategorie: "Vormonat", Wert: costOverview.previousMonth }, { Kategorie: "Einsparungen", Wert: costOverview.savings }],
              "kostenuebersicht",
              { Kategorie: "Kategorie", Wert: "Wert (€)" }
            )
          }
        >
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>
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
    </div>
  );
};

export default CostOverview;
