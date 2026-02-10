import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useEnergyData } from "@/hooks/useEnergyData";
import { Leaf, Gauge } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEnergy } from "@/lib/formatEnergy";

interface SustainabilityKPIsProps {
  locationId: string | null;
}

const SustainabilityKPIs = ({ locationId }: SustainabilityKPIsProps) => {
  const { energyTotals, loading, hasData } = useEnergyData(locationId);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[200px]" /></CardContent></Card>;

  const totalConsumption = energyTotals.strom + energyTotals.gas + energyTotals.waerme + energyTotals.wasser;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Leaf className="h-5 w-5 text-accent" />
          Verbrauchsübersicht
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasData ? (
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
                <span className="text-sm text-muted-foreground">{formatEnergy(energyTotals.strom)}</span>
              </div>
              <Progress value={totalConsumption > 0 ? (energyTotals.strom / totalConsumption) * 100 : 0} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Gas</span>
                <span className="text-sm text-muted-foreground">{formatEnergy(energyTotals.gas)}</span>
              </div>
              <Progress value={totalConsumption > 0 ? (energyTotals.gas / totalConsumption) * 100 : 0} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Wärme</span>
                <span className="text-sm text-muted-foreground">{formatEnergy(energyTotals.waerme)}</span>
              </div>
              <Progress value={totalConsumption > 0 ? (energyTotals.waerme / totalConsumption) * 100 : 0} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Wasser</span>
                <span className="text-sm text-muted-foreground">{formatEnergy(energyTotals.wasser)}</span>
              </div>
              <Progress value={totalConsumption > 0 ? (energyTotals.wasser / totalConsumption) * 100 : 0} className="h-2" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SustainabilityKPIs;
