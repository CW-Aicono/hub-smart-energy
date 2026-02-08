import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { sustainabilityKPIs } from "@/data/mockData";
import { Leaf, Wind, Gauge, Cloud } from "lucide-react";

interface SustainabilityKPIsProps {
  locationId: string | null;
}

const SustainabilityKPIs = ({ locationId }: SustainabilityKPIsProps) => {
  // In a real implementation, filter data by locationId
  const co2Progress = Math.round((1 - sustainabilityKPIs.co2Current / sustainabilityKPIs.co2Target) * 100 + 100);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Leaf className="h-5 w-5 text-accent" />
          Nachhaltigkeits-KPIs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1">
              <Cloud className="h-4 w-4 text-accent" /> CO₂-Emissionen
            </span>
            <span className="text-sm text-muted-foreground">
              {sustainabilityKPIs.co2Current}t / {sustainabilityKPIs.co2Target}t Ziel
            </span>
          </div>
          <Progress value={Math.min(co2Progress, 100)} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            Noch {(sustainabilityKPIs.co2Current - sustainabilityKPIs.co2Target).toFixed(1)}t über dem Ziel
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1">
              <Wind className="h-4 w-4 text-accent" /> Erneuerbare Energien
            </span>
            <span className="text-sm text-muted-foreground">
              {sustainabilityKPIs.renewablePercent}% / {sustainabilityKPIs.renewableTarget}%
            </span>
          </div>
          <Progress value={(sustainabilityKPIs.renewablePercent / sustainabilityKPIs.renewableTarget) * 100} className="h-2" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-1">
              <Gauge className="h-4 w-4 text-accent" /> Effizienz-Score
            </span>
            <span className="text-sm font-display font-bold text-accent">
              {sustainabilityKPIs.efficiencyScore}/100
            </span>
          </div>
          <Progress value={sustainabilityKPIs.efficiencyScore} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
};

export default SustainabilityKPIs;
